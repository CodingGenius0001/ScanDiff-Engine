import Foundation
import Observation

enum AppRoute: Hashable {
    case caseFile(String)
}

@MainActor
@Observable
final class AppModel {
    var itemID = ""
    var kind: ScanKind = .baseline
    var homeMessage: String?
    var activeScan: ScanSessionModel?
    var path: [AppRoute] = []
    var recentItemIDs: [String] = []
    var isStarting = false
    private(set) var pendingLink: URL?
    /// Item to open once the scan flow closes, so every scan lands on its case file.
    private var finishedItemID: String?

    func loadRecentItems() async {
        recentItemIDs = (try? await ItemsService().recentItemIDs()) ?? recentItemIDs
    }

    /// The manual fallback: a typed item id and kind.
    func start() async {
        let normalized = ItemID.normalize(itemID)
        guard !normalized.isEmpty else {
            homeMessage = ScanError.invalidItemID.errorDescription
            return
        }
        itemID = normalized
        await begin(ScanRequest(itemID: normalized, kind: kind))
    }

    /// A scan for an item, from a case file, a new listing or a QR code.
    func startScan(itemID: String, kind: ScanKind) async {
        await begin(ScanRequest(itemID: ItemID.normalize(itemID), kind: kind))
    }

    /// Links that arrive before sign-in are held and replayed once signed in.
    func open(_ url: URL, isSignedIn: Bool) {
        guard isSignedIn else {
            pendingLink = url
            return
        }
        if let share = Self.shareLink(in: url) {
            Task { await join(share.itemID, inviteCode: share.code) }
            return
        }
        if let itemID = Self.caseFileID(in: url) {
            showCaseFile(itemID)
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

    /// A QR code's text: a scandiff:// scan link, or a link to an item on the website.
    func openScannedCode(_ text: String) -> Bool {
        guard let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)) else { return false }
        if url.scheme?.lowercased() == "scandiff" || Self.caseFileID(in: url) != nil {
            Diagnostics.log("QR code opened \(url.scheme ?? "")://\(url.host ?? "")\(url.path)")
            open(url, isSignedIn: true)
            return true
        }
        return false
    }

    func resumePendingLink() {
        guard let link = pendingLink else { return }
        pendingLink = nil
        open(link, isSignedIn: true)
    }

    func showCaseFile(_ itemID: String) {
        path = [.caseFile(itemID)]
    }

    /// A share link from the website or another phone: join the item, then open it.
    private func join(_ itemID: String, inviteCode: String) async {
        do {
            try await ItemsService().join(itemID: itemID, inviteCode: inviteCode)
            Diagnostics.log("joined \(itemID) from a share link")
            showCaseFile(itemID)
        } catch {
            homeMessage = error.localizedDescription
        }
    }

    /// Forgets the previous account's items and screens, so the next sign-in starts clean.
    func signedOut() {
        activeScan = nil
        finishedItemID = nil
        path = []
        itemID = ""
        kind = .baseline
        homeMessage = nil
        recentItemIDs = []
    }

    func leaveScan() {
        let item = activeScan?.request.itemID
        let uploaded = activeScan?.receipt != nil
        activeScan = nil
        if uploaded, let item {
            finishedItemID = item
        }
        Task { await loadRecentItems() }
    }

    /// Called once the scan cover has closed.
    func openFinishedCaseFile() {
        guard let item = finishedItemID else { return }
        finishedItemID = nil
        showCaseFile(item)
    }

    /// https://scandiff.us/join/<id>?code=<invite code>: a share link.
    nonisolated static func shareLink(in url: URL) -> (itemID: String, code: String)? {
        guard let itemID = caseFileID(in: url), url.pathComponents.dropFirst().first == "join",
              let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "code" })?.value,
              !code.isEmpty else { return nil }
        return (itemID, code)
    }

    /// https://scandiff.us/item/<id>, /checkout/<id> or /join/<id> names a case file.
    nonisolated static func caseFileID(in url: URL) -> String? {
        guard let host = url.host?.lowercased(), host == WebLinks.host || host == "www.\(WebLinks.host)" else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard parts.count >= 2, ["item", "checkout", "join"].contains(parts[0]) else { return nil }
        let id = ItemID.normalize(parts[1])
        return id.isEmpty ? nil : id
    }

    /// Checks, before opening the camera rather than after a full scan, that
    /// this account may scan the item: a baseline needs a new item or one this
    /// account owns, and a check scan needs an item it belongs to that has a
    /// baseline. A share link's invite code joins the item first.
    private func begin(_ request: ScanRequest) async {
        homeMessage = nil
        isStarting = true
        defer { isStarting = false }
        let items = ItemsService()
        do {
            if let invite = request.invite {
                try await items.join(itemID: request.itemID, inviteCode: invite)
            }
            switch (request.kind, try await items.access(itemID: request.itemID)) {
            case (_, .others):
                homeMessage = "\"\(request.itemID)\" belongs to another account. Use a different item id, or open the share link from the item's owner."
                return
            case (.baseline, .member):
                homeMessage = "Only the account that owns \"\(request.itemID)\" can scan its baseline. Scan a check instead."
                return
            case (.check, .missing):
                homeMessage = noBaselineMessage(for: request.itemID)
                return
            case (.check, _):
                guard try await items.hasBaseline(itemID: request.itemID) else {
                    homeMessage = noBaselineMessage(for: request.itemID)
                    return
                }
            case (.baseline, _):
                break
            }
        } catch {
            homeMessage = "Couldn't check the item: \(error.localizedDescription)"
            return
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
            message += " The seller scans a baseline first, using the exact same item ID."
        }
        return message
    }
}

/// The website (Vercel, root directory web/).
enum WebLinks {
    static let host = "scandiff.us"
    static let base = URL(string: "https://\(host)") ?? URL(fileURLWithPath: "/")

    static func item(_ itemID: String) -> URL {
        base.appending(path: "item").appending(path: itemID)
    }

    static func checkout(_ itemID: String) -> URL {
        base.appending(path: "checkout").appending(path: itemID)
    }

    /// The share link: whoever opens it signed in joins the item, then lands on `to`.
    static func join(_ itemID: String, code: String, to: String = "checkout") -> URL {
        base.appending(path: "join").appending(path: itemID)
            .appending(queryItems: [URLQueryItem(name: "code", value: code), URLQueryItem(name: "to", value: to)])
    }
}
