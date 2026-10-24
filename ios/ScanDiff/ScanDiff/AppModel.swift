import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    var itemID = ""
    var kind: ScanKind = .baseline
    var homeMessage: String?
    var activeScan: ScanSessionModel?

    func start() {
        let trimmed = itemID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard ItemID.isValid(trimmed) else {
            homeMessage = ScanError.invalidItemID.errorDescription
            return
        }
        begin(ScanRequest(itemID: trimmed, kind: kind))
    }

    func open(_ url: URL) {
        switch DeepLink.parse(url) {
        case .success(let request):
            itemID = request.itemID
            kind = request.kind
            begin(request)
        case .failure(let error):
            homeMessage = error.errorDescription
        }
    }

    func leaveScan() {
        activeScan = nil
    }

    private func begin(_ request: ScanRequest) {
        homeMessage = nil
        do {
            activeScan = try ScanSessionModel(request: request)
        } catch {
            homeMessage = error.localizedDescription
        }
    }
}
