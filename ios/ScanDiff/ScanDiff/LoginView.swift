import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthService
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var busy: Busy?
    @State private var errorMessage: String?
    @State private var infoMessage: String?
    @State private var pendingConfirmation: PendingConfirmation?
    @FocusState private var focus: Field?

    private struct PendingConfirmation: Equatable {
        let email: String
        let password: String
    }

    private enum Mode { case signIn, signUp }
    private enum Busy { case google, email }
    private enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                header
                GoogleContinueButton(isLoading: busy == .google) {
                    Task { await signInWithGoogle() }
                }
                .disabled(busy != nil)
                divider
                emailForm
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 48)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .onTapGesture { focus = nil }
    }

    private var header: some View {
        VStack(spacing: 12) {
            AppLogo(size: 76)
            Text("ScanDiff")
                .font(.largeTitle.bold())
            Text("Proof of condition, at every handoff")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.bottom, 8)
    }

    private var divider: some View {
        HStack(spacing: 12) {
            Rectangle().frame(height: 1).foregroundStyle(.quaternary)
            Text("or")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Rectangle().frame(height: 1).foregroundStyle(.quaternary)
        }
    }

    private var emailForm: some View {
        VStack(spacing: 14) {
            Picker("Account", selection: modeSelection) {
                Text("Sign in").tag(Mode.signIn)
                Text("Create account").tag(Mode.signUp)
            }
            .pickerStyle(.segmented)
            .disabled(busy != nil)

            TextField("Email", text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.next)
                .focused($focus, equals: .email)
                .onSubmit { focus = .password }
                .fieldStyle()

            SecureField(mode == .signIn ? "Password" : "Password (8+ characters)", text: $password)
                .textContentType(mode == .signIn ? .password : .newPassword)
                .submitLabel(.go)
                .focused($focus, equals: .password)
                .onSubmit { Task { await submitEmail() } }
                .fieldStyle()

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity)
            }
            if let infoMessage {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Label(infoMessage, systemImage: "envelope.badge")
                    if pendingConfirmation != nil {
                        ProgressView().controlSize(.small)
                    }
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity)
            }

            Button {
                Task { await submitEmail() }
            } label: {
                ZStack {
                    Text(mode == .signIn ? "Sign in" : "Create account")
                        .font(.headline)
                        .opacity(busy == .email ? 0 : 1)
                    if busy == .email {
                        ProgressView()
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 28)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!canSubmit)

            #if DEBUG
            HStack(spacing: 20) {
                Button("Use demo account") {
                    email = DemoAccount.email
                    password = DemoAccount.password
                    mode = .signIn
                    errorMessage = nil
                }
                if let buyer = AppSecrets.demoAccount2 {
                    Button("Use demo buyer") {
                        email = buyer.email
                        password = buyer.password
                        mode = .signIn
                        errorMessage = nil
                    }
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            .disabled(busy != nil)
            #endif
        }
        .animation(.default, value: errorMessage)
        .animation(.default, value: infoMessage)
        .task(id: pendingConfirmation) {
            guard let pending = pendingConfirmation else { return }
            let signedIn = await auth.waitForConfirmation(email: pending.email, password: pending.password)
            guard !Task.isCancelled, !signedIn else { return }
            pendingConfirmation = nil
            infoMessage = "Once you've confirmed \(pending.email), sign in here."
        }
    }

    private var modeSelection: Binding<Mode> {
        Binding(
            get: { mode },
            set: { newMode in
                withAnimation {
                    mode = newMode
                    errorMessage = nil
                    infoMessage = nil
                    pendingConfirmation = nil
                }
            }
        )
    }

    private var trimmedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSubmit: Bool {
        guard busy == nil else { return false }
        let validEmail = trimmedEmail.contains("@") && trimmedEmail.contains(".")
        let minimum = mode == .signIn ? 1 : 8
        return validEmail && password.count >= minimum
    }

    private func signInWithGoogle() async {
        focus = nil
        errorMessage = nil
        infoMessage = nil
        busy = .google
        defer { busy = nil }
        do {
            try await auth.signInWithGoogle()
        } catch SignInError.cancelled {
            return
        } catch {
            errorMessage = SignInError.from(error).errorDescription
        }
    }

    private func submitEmail() async {
        guard canSubmit else { return }
        focus = nil
        errorMessage = nil
        infoMessage = nil
        pendingConfirmation = nil
        busy = .email
        defer { busy = nil }
        do {
            switch mode {
            case .signIn:
                try await auth.signInWithEmail(trimmedEmail, password: password)
            case .signUp:
                if case .confirmationSent(let address) = try await auth.signUp(email: trimmedEmail, password: password) {
                    mode = .signIn
                    infoMessage = "We sent a confirmation link to \(address). Tap it on any device; you'll be signed in here automatically."
                    pendingConfirmation = PendingConfirmation(email: trimmedEmail, password: password)
                }
            }
        } catch {
            errorMessage = SignInError.from(error).errorDescription
        }
    }
}

#if DEBUG
enum DemoAccount {
    static let email = "demo@scandiff.dev"
    static let password = "ScanDiffDemo!2026"
}
#endif

private extension View {
    func fieldStyle() -> some View {
        padding(.horizontal, 14)
            .frame(minHeight: 48)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color(.separator), lineWidth: 0.5))
    }
}
