import Foundation
import Supabase

enum AuthPhase: Equatable {
    case restoring
    case signedOut
    case signedIn
}

enum SignUpOutcome: Equatable {
    case signedIn
    case confirmationSent(email: String)
}

enum SignInError: LocalizedError, Equatable {
    case notConfigured
    case googleNotConfigured
    case cancelled
    case noPresenter
    case googleFailed(String)
    case nonceMismatch
    case invalidCredentials
    case emailNotConfirmed
    case accountExists
    case weakPassword
    case rateLimited
    case providerDisabled
    case offline
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to Secrets.xcconfig."
        case .googleNotConfigured:
            "Google sign-in is not configured in this build."
        case .cancelled:
            "Sign-in was cancelled."
        case .noPresenter:
            "Could not open the Google sign-in screen."
        case .googleFailed(let message):
            "Google sign-in failed. \(message)"
        case .nonceMismatch:
            "Google sign-in could not be verified. Try again."
        case .invalidCredentials:
            "Email or password is incorrect."
        case .emailNotConfirmed:
            "Confirm your email first. Check your inbox for the link."
        case .accountExists:
            "An account with this email already exists. Sign in instead."
        case .weakPassword:
            "Choose a stronger password (at least 8 characters)."
        case .rateLimited:
            "Too many attempts. Wait a minute and try again."
        case .providerDisabled:
            "Google sign-in is turned off for this project."
        case .offline:
            "You appear to be offline. Check your connection and try again."
        case .server(let message):
            message
        }
    }

    static func from(_ error: Error) -> SignInError {
        if let error = error as? SignInError {
            return error
        }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cannotConnectToHost:
                return .offline
            default:
                return .server(urlError.localizedDescription)
            }
        }
        if let authError = error as? AuthError {
            switch authError.errorCode {
            case .invalidCredentials: return .invalidCredentials
            case .emailNotConfirmed: return .emailNotConfirmed
            case .userAlreadyExists, .emailExists: return .accountExists
            case .weakPassword: return .weakPassword
            case .overRequestRateLimit: return .rateLimited
            case .providerDisabled: return .providerDisabled
            default:
                if authError.message.localizedCaseInsensitiveContains("nonce") {
                    return .nonceMismatch
                }
                return .server(authError.message)
            }
        }
        return .server(error.localizedDescription)
    }
}

struct UserSummary: Equatable {
    let id: UUID
    let displayName: String
    let email: String?
    let avatarURL: URL?

    init(user: User) {
        id = user.id
        email = user.email
        let metadata = user.userMetadata
        let name = metadata["full_name"]?.stringValue
            ?? metadata["name"]?.stringValue
            ?? metadata["display_name"]?.stringValue
        displayName = name ?? user.email?.components(separatedBy: "@").first ?? "ScanDiff user"
        let avatar = metadata["avatar_url"]?.stringValue ?? metadata["picture"]?.stringValue
        avatarURL = avatar.flatMap(URL.init(string:))
    }

    var initials: String {
        let parts = displayName.split(separator: " ").prefix(2)
        let letters = parts.compactMap(\.first).map(String.init).joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }
}
