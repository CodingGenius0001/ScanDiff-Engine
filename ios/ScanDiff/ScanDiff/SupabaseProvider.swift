import Foundation
import Supabase

/// One client for the whole app, so every database and storage call
/// carries the signed-in user's session.
enum SupabaseProvider {
    static let loginCallbackURL = URL(string: "scandiff://login-callback")

    static let client: SupabaseClient? = {
        guard let url = AppSecrets.supabaseURL, let key = AppSecrets.supabaseAnonKey else {
            return nil
        }
        return SupabaseClient(
            supabaseURL: url,
            supabaseKey: key,
            options: SupabaseClientOptions(
                auth: .init(
                    redirectToURL: loginCallbackURL,
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
    }()

    static func isLoginCallback(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "scandiff" && url.host?.lowercased() == "login-callback"
    }
}
