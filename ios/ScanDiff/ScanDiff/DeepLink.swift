import Foundation

enum DeepLink {
    static func parse(_ url: URL) -> Result<ScanRequest, ScanError> {
        guard url.scheme?.lowercased() == "scandiff", url.host?.lowercased() == "scan" else {
            return .failure(.sessionFailed("That link is not a ScanDiff scan link."))
        }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let itemID = items.first { $0.name == "item" }?.value?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard ItemID.isValid(itemID) else {
            return .failure(.invalidItemID)
        }
        let kindRaw = items.first { $0.name == "kind" }?.value?.lowercased() ?? ScanKind.baseline.rawValue
        guard let kind = ScanKind(rawValue: kindRaw) else {
            return .failure(.sessionFailed("Scan kind must be baseline or check."))
        }
        return .success(ScanRequest(itemID: itemID, kind: kind))
    }
}
