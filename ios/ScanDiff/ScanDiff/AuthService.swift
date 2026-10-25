import AuthenticationServices
import Combine
import Foundation
import Supabase

@MainActor
final class AuthService: ObservableObject {
    @Published private(set) var phase: AuthPhase = .restoring
    @Published private(set) var currentUser: UserSummary?

    private let client: SupabaseClient?
    private var listener: Task<Void, Never>?

    init(client: SupabaseClient? = SupabaseProvider.client) {
        self.client = client
    }

    /// Restores the stored session and keeps `phase` in sync with Supabase.
    /// The first event is always the locally stored session (or none).
    func start() {
        guard listener == nil else { return }
        guard let client else {
            phase = .signedOut
            return
        }
        listener = Task { [weak self] in
            for await change in client.auth.authStateChanges {
                guard let self, !Task.isCancelled else { return }
                self.apply(session: change.session)
            }
        }
    }

    func handleCallback(_ url: URL) {
        client?.auth.handle(url)
    }

    func signInWithEmail(_ email: String, password: String) async throws {
        let client = try requireClient()
        do {
            try await client.auth.signIn(email: email, password: password)
        } catch {
            throw SignInError.from(error)
        }
    }

    func signUp(email: String, password: String) async throws -> SignUpOutcome {
        let client = try requireClient()
        do {
            let response = try await client.auth.signUp(email: email, password: password)
            return response.session == nil ? .confirmationSent(email: email) : .signedIn
        } catch {
            throw SignInError.from(error)
        }
    }

    /// After sign-up, keeps trying the same credentials until the email is
    /// confirmed, on this phone or any other device, so the user never has to
    /// come back and sign in. Returns false on timeout or a non-retryable error.
    func waitForConfirmation(email: String, password: String, timeout: Duration = .seconds(900)) async -> Bool {
        guard let client else { return false }
        let clock = ContinuousClock()
        let started = clock.now
        Diagnostics.log("waiting for email confirmation")
        try? await Task.sleep(for: .seconds(5))
        while clock.now - started < timeout, !Task.isCancelled {
            if phase == .signedIn { return true }
            // Every 5 s for two minutes, then every 10 s, within Supabase's sign-in rate limit.
            var delay: Duration = clock.now - started < .seconds(120) ? .seconds(5) : .seconds(10)
            do {
                try await client.auth.signIn(email: email, password: password)
                Diagnostics.log("email confirmed, signed in automatically")
                return true
            } catch {
                switch SignInError.from(error) {
                case .emailNotConfirmed, .offline:
                    break
                case .rateLimited:
                    delay = .seconds(30)
                default:
                    Diagnostics.log("stopped waiting for confirmation: \(error.localizedDescription)")
                    return false
                }
            }
            try? await Task.sleep(for: delay)
        }
        return phase == .signedIn
    }

    /// Native Google sign-in first. If that fails for any reason other than
    /// the user cancelling, falls back to the Supabase web OAuth flow.
    func signInWithGoogle() async throws {
        let client = try requireClient()
        do {
            try await nativeGoogleSignIn(client: client)
        } catch SignInError.cancelled {
            throw SignInError.cancelled
        } catch {
            do {
                try await webGoogleSignIn(client: client)
            } catch let webError as ASWebAuthenticationSessionError where webError.code == .canceledLogin {
                throw SignInError.cancelled
            } catch {
                throw SignInError.from(error)
            }
        }
    }

    func signOut() async {
        GoogleNativeSignIn.signOut()
        guard let client else {
            apply(session: nil)
            return
        }
        do {
            try await client.auth.signOut()
        } catch {
            try? await client.auth.signOut(scope: .local)
        }
    }

    private func nativeGoogleSignIn(client: SupabaseClient) async throws {
        let nonce = SignInNonce.make()
        let tokens = try await GoogleNativeSignIn.signIn(hashedNonce: nonce?.hashed)
        do {
            try await client.auth.signInWithIdToken(
                credentials: .init(
                    provider: .google,
                    idToken: tokens.idToken,
                    accessToken: tokens.accessToken,
                    nonce: nonce?.raw
                )
            )
        } catch {
            guard SignInError.from(error) == .nonceMismatch else { throw error }
            try await client.auth.signInWithIdToken(
                credentials: .init(
                    provider: .google,
                    idToken: tokens.idToken,
                    accessToken: tokens.accessToken
                )
            )
        }
    }

    private func webGoogleSignIn(client: SupabaseClient) async throws {
        try await client.auth.signInWithOAuth(
            provider: .google,
            redirectTo: SupabaseProvider.loginCallbackURL
        )
    }

    private func requireClient() throws -> SupabaseClient {
        guard let client else { throw SignInError.notConfigured }
        return client
    }

    private func apply(session: Session?) {
        if let session {
            currentUser = UserSummary(user: session.user)
            phase = .signedIn
        } else {
            currentUser = nil
            phase = .signedOut
        }
    }
}
