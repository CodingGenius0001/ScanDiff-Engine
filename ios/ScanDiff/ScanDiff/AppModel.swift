import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    var itemID = ""
    var kind: ScanKind = .baseline
    var homeMessage: String?
    var activeScan: ScanSessionModel?
    var recentItemIDs: [String] = []
    var isStarting = false
    private(set) var pendingLink: URL?

    func loadRecentItems() async {
        recentItemIDs = (try? await ItemsService().recentItemIDs()) ?? recentItemIDs
    }

    func start() async {
        let trimmed = itemID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard ItemID.isValid(trimmed) else {
            homeMessage = ScanError.invalidItemID.errorDescription
            return
        }
        await begin(ScanRequest(itemID: trimmed, kind: kind))
    }

    /// Links that arrive before sign-in are held and replayed once signed in.
    func open(_ url: URL, isSignedIn: Bool) {
        guard isSignedIn else {
            pendingLink = url
            return
        }
        switch DeepLink.parse(url) {
        case .success(let request):
            itemID = request.itemID
            kind = request.kind
            Task { await begin(request) }
        case .failure(let error):
            homeMessage = error.errorDescription
        }
    }

    func resumePendingLink() {
        guard let link = pendingLink else { return }
        pendingLink = nil
        open(link, isSignedIn: true)
    }

    func leaveScan() {
        activeScan = nil
        Task { await loadRecentItems() }
    }

    /// A check scan only makes sense against an existing baseline, so verify
    /// that before opening the camera rather than after a full scan.
    private func begin(_ request: ScanRequest) async {
        homeMessage = nil
        if request.kind == .check {
            isStarting = true
            defer { isStarting = false }
            do {
                guard try await ItemsService().hasBaseline(itemID: request.itemID) else {
                    homeMessage = noBaselineMessage(for: request.itemID)
                    return
                }
            } catch {
                homeMessage = "Couldn't check for a baseline: \(error.localizedDescription)"
                return
            }
        }
        do {
            activeScan = try ScanSessionModel(request: request)
        } catch {
            homeMessage = error.localizedDescription
        }
    }

    private func noBaselineMessage(for itemID: String) -> String {
        var message = "\"\(itemID)\" has no baseline yet, so there's nothing to compare against."
        if let suggestion = ItemsService.closest(to: itemID, in: recentItemIDs) {
            message += " Did you mean \"\(suggestion)\"?"
        } else {
            message += " Scan a baseline first, using the exact same item id."
        }
        return message
    }
}
