import Foundation

enum AppSecrets {
    static var supabaseURL: URL? {
        url(forInfoKey: "SupabaseURL")
    }

    static var supabaseAnonKey: String? {
        nonempty(string(forInfoKey: "SupabaseAnonKey"))
    }

    static var engineURL: URL? {
        url(forInfoKey: "EngineURL")
    }

    static var engineFallbackURL: URL? {
        url(forInfoKey: "EngineURLFallback")
    }

    static var googleIOSClientID: String? {
        nonempty(string(forInfoKey: "GoogleIOSClientID"))
    }

    static var googleWebClientID: String? {
        nonempty(string(forInfoKey: "GoogleWebClientID"))
    }

    /// Second demo account (buyer) from Secrets.xcconfig; nil when not configured.
    static var demoAccount2: (email: String, password: String)? {
        guard let email = nonempty(string(forInfoKey: "DemoAccount2Email")),
              let password = nonempty(string(forInfoKey: "DemoAccount2Password")) else {
            return nil
        }
        return (email, password)
    }

    static var hasSupabase: Bool {
        supabaseURL != nil && supabaseAnonKey != nil
    }

    private static func string(forInfoKey key: String) -> String? {
        Bundle.main.object(forInfoDictionaryKey: key) as? String
    }

    private static func nonempty(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }

    private static func url(forInfoKey key: String) -> URL? {
        guard let raw = nonempty(string(forInfoKey: key)),
              let url = URL(string: raw),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              url.host != nil else {
            return nil
        }
        return url
    }
}
