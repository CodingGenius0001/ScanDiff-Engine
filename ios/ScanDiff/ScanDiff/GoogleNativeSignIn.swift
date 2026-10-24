import CryptoKit
import Foundation
import GoogleSignIn
import Security
import UIKit

struct GoogleTokens {
    let idToken: String
    let accessToken: String
}

/// A random value sent to Google hashed and to Supabase raw, so Supabase can
/// confirm the ID token was minted for this sign-in attempt.
struct SignInNonce {
    let raw: String
    let hashed: String

    static func make() -> SignInNonce? {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            return nil
        }
        let raw = bytes.map { String(format: "%02x", $0) }.joined()
        let hashed = SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
        return SignInNonce(raw: raw, hashed: hashed)
    }
}

@MainActor
enum GoogleNativeSignIn {
    static func signIn(hashedNonce: String?) async throws -> GoogleTokens {
        guard let clientID = AppSecrets.googleIOSClientID, isCallbackSchemeRegistered(for: clientID) else {
            throw SignInError.googleNotConfigured
        }
        guard let presenter = UIApplication.shared.topViewController else {
            throw SignInError.noPresenter
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(
            clientID: clientID,
            serverClientID: AppSecrets.googleWebClientID
        )
        let result: GIDSignInResult
        do {
            result = try await GIDSignIn.sharedInstance.signIn(
                withPresenting: presenter,
                hint: nil,
                additionalScopes: nil,
                nonce: hashedNonce
            )
        } catch let error as GIDSignInError where error.code == .canceled {
            throw SignInError.cancelled
        } catch {
            throw SignInError.googleFailed(error.localizedDescription)
        }
        guard let idToken = result.user.idToken?.tokenString else {
            throw SignInError.googleFailed("Google did not return an ID token.")
        }
        return GoogleTokens(idToken: idToken, accessToken: result.user.accessToken.tokenString)
    }

    static func signOut() {
        GIDSignIn.sharedInstance.signOut()
    }

    static func handle(_ url: URL) -> Bool {
        GIDSignIn.sharedInstance.handle(url)
    }

    /// GoogleSignIn raises an exception if the reversed client ID is not a
    /// registered URL scheme, so check before calling it.
    private static func isCallbackSchemeRegistered(for clientID: String) -> Bool {
        let reversed = clientID.split(separator: ".").reversed().joined(separator: ".")
        let types = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
        let schemes = types.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] }
        return schemes.contains { $0.caseInsensitiveCompare(reversed) == .orderedSame }
    }
}

extension UIApplication {
    var topViewController: UIViewController? {
        let scenes = connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes
            .first { $0.activationState == .foregroundActive }?
            .windows
            .first { $0.isKeyWindow }
            ?? scenes.flatMap(\.windows).first { $0.isKeyWindow }
        var top = window?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}
