import Foundation

enum DeepLink {
    /// scandiff://scan?item=<id>&kind=<baseline|check>. The item id is normalized
    /// to lowercase kebab-case so a link and a typed id name the same item.
    static func parse(_ url: URL) -> Result<ScanRequest, ScanError> {
        guard url.scheme?.lowercased() == "scandiff", url.host?.lowercased() == "scan" else {
            return .failure(.sessionFailed("That link is not a ScanDiff scan link."))
        }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let itemID = ItemID.normalize(items.first { $0.name == "item" }?.value ?? "")
        guard !itemID.isEmpty else {
            return .failure(.invalidItemID)
        }
        let kindRaw = items.first { $0.name == "kind" }?.value?.lowercased() ?? ScanKind.baseline.rawValue
        guard let kind = ScanKind(rawValue: kindRaw) else {
            return .failure(.sessionFailed("Scan kind must be baseline or check."))
        }
        return .success(ScanRequest(itemID: itemID, kind: kind))
    }
}
