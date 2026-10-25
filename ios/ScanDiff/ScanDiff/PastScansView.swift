import Observation
import Supabase
import SwiftUI

/// One row of the `scans` table.
struct PastScan: Identifiable, Equatable, Decodable {
    let id: UUID
    let itemID: String
    let version: Int
    let kind: ScanKind
    let modelURL: URL?
    let sha256: String?
    let createdBy: String?
    let createdAt: Date?
    var decision: String?

    private enum Keys: String, CodingKey {
        case id, item_id, version, kind, model_url, sha256, created_by, created_at, decision
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(UUID.self, forKey: .id)
        itemID = try c.decode(String.self, forKey: .item_id)
        version = try c.decodeIfPresent(Int.self, forKey: .version) ?? 0
        kind = (try? c.decode(ScanKind.self, forKey: .kind)) ?? .baseline
        modelURL = (try c.decodeIfPresent(String.self, forKey: .model_url)).flatMap(URL.init(string:))
        sha256 = try c.decodeIfPresent(String.self, forKey: .sha256)
        createdBy = try c.decodeIfPresent(String.self, forKey: .created_by)
        createdAt = (try c.decodeIfPresent(String.self, forKey: .created_at)).flatMap(Self.parseDate)
        decision = try c.decodeIfPresent(String.self, forKey: .decision)
    }

    /// Postgres returns timestamps with or without fractional seconds.
    static func parseDate(_ raw: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: raw) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: raw)
    }
}

@MainActor
@Observable
final class PastScansModel {
    var scans: [PastScan] = []
    var isLoading = false
    var errorMessage: String?

    /// Every scan of the signed-in user's items, including the other party's:
    /// row-level security leaves out items they don't own or haven't joined.
    func load() async {
        guard let client = SupabaseProvider.client else {
            errorMessage = ScanError.missingSecrets.errorDescription
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let rows: [PastScan] = try await client
                .from("scans")
                .select("id,item_id,version,kind,model_url,sha256,created_by,created_at,decision")
                .order("created_at", ascending: false)
                .limit(500)
                .execute()
                .value
            scans = rows.filter { !$0.itemID.hasPrefix("_") }
            errorMessage = nil
        } catch {
            errorMessage = "Couldn't load scans: \(error.localizedDescription)"
        }
    }

    func update(_ scan: PastScan) {
        if let index = scans.firstIndex(where: { $0.id == scan.id }) {
            scans[index] = scan
        }
    }
}

struct PastScansView: View {
    /// Called after the sheet is dismissed, with the item to check-scan.
    var onScanAgain: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var model = PastScansModel()

    var body: some View {
        NavigationStack {
            List {
                if let errorMessage = model.errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                }
                ForEach(groupedByItem, id: \.itemID) { group in
                    Section(group.itemID) {
                        ForEach(group.scans) { scan in
                            NavigationLink(value: scan) {
                                PastScanRow(scan: scan)
                            }
                        }
                    }
                }
            }
            .overlay {
                if model.scans.isEmpty && !model.isLoading && model.errorMessage == nil {
                    ContentUnavailableView(
                        "No scans yet",
                        systemImage: "cube.transparent",
                        description: Text("Items you scan, and items shared with you, appear here with every scan of them.")
                    )
                } else if model.isLoading && model.scans.isEmpty {
                    ProgressView()
                }
            }
            .navigationTitle("Past scans")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: PastScan.self) { scan in
                PastScanDetailView(scan: scan, onChange: model.update) { itemID in
                    dismiss()
                    onScanAgain(itemID)
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await model.load() }
            .refreshable { await model.load() }
        }
    }

    /// Items in order of their most recent scan, each item's scans newest first.
    private var groupedByItem: [(itemID: String, scans: [PastScan])] {
        var order: [String] = []
        var byItem: [String: [PastScan]] = [:]
        for scan in model.scans {
            if byItem[scan.itemID] == nil { order.append(scan.itemID) }
            byItem[scan.itemID, default: []].append(scan)
        }
        return order.map { ($0, byItem[$0] ?? []) }
    }
}

extension PastScan: Hashable {
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

private struct PastScanRow: View {
    let scan: PastScan

    private var isMine: Bool {
        scan.createdBy != nil && scan.createdBy == SupabaseProvider.client?.auth.currentUser?.id.uuidString.lowercased()
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: scan.kind == .baseline ? "cube" : "checkmark.seal")
                .font(.title3)
                .foregroundStyle(scan.kind == .baseline ? Color.accentColor : .teal)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(scan.kind.title) · v\(scan.version)\(isMine ? " · You" : "")")
                    .font(.subheadline.weight(.semibold))
                if let date = scan.createdAt {
                    Text(date, format: .relative(presentation: .named))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            if let decision = scan.decision {
                DecisionChip(decision: decision)
            }
        }
    }
}

private struct DecisionChip: View {
    let decision: String

    var body: some View {
        Text(decision == "accept" ? "Accepted" : "Disputed")
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background((decision == "accept" ? Color.green : .red).opacity(0.18), in: Capsule())
            .foregroundStyle(decision == "accept" ? Color.green : .red)
    }
}

struct PastScanDetailView: View {
    @State var scan: PastScan
    var onChange: (PastScan) -> Void
    var onScanAgain: (String) -> Void
    @State private var localModel: URL?
    @State private var loadError: String?
    @State private var isDeciding = false
    @State private var decisionError: String?

    private static let webBase = URL(string: "https://scandiff.vercel.app")

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                preview
                    .frame(height: 300)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 6) {
                    Text("\(scan.itemID) · \(scan.kind.title) v\(scan.version)")
                        .font(.headline)
                    if let date = scan.createdAt {
                        Text(date.formatted(date: .abbreviated, time: .shortened))
                            .foregroundStyle(.secondary)
                    }
                    if let sha = scan.sha256 {
                        Text("SHA256 \(sha.prefix(12))…")
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }
                    Text("Scan id \(scan.id.uuidString.lowercased())")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                if scan.kind == .check {
                    decisionControls
                }

                if let webBase = Self.webBase {
                    Link(destination: webBase.appendingPathComponent("item").appendingPathComponent(scan.itemID)) {
                        Label("Open on the web", systemImage: "safari")
                    }
                }

                Button {
                    onScanAgain(scan.itemID)
                } label: {
                    Label("Check-scan this item", systemImage: "viewfinder")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
        }
        .navigationTitle(scan.itemID)
        .navigationBarTitleDisplayMode(.inline)
        .task { await downloadModel() }
    }

    @ViewBuilder
    private var preview: some View {
        if let localModel {
            ModelPreview(url: localModel)
        } else if let loadError {
            ContentUnavailableView("Model unavailable", systemImage: "exclamationmark.triangle", description: Text(loadError))
                .background(Color(.secondarySystemBackground))
        } else {
            ProgressView("Loading model…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(.secondarySystemBackground))
        }
    }

    private var decisionControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Decision")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if let decision = scan.decision {
                    DecisionChip(decision: decision)
                } else {
                    Text("None yet").font(.caption).foregroundStyle(.secondary)
                }
            }
            HStack {
                Button("Accept") { Task { await decide("accept") } }
                    .buttonStyle(.bordered)
                    .tint(.green)
                Button("Dispute") { Task { await decide("dispute") } }
                    .buttonStyle(.bordered)
                    .tint(.red)
            }
            .disabled(isDeciding)
            if let decisionError {
                Text(decisionError).font(.footnote).foregroundStyle(.red)
            }
        }
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private func decide(_ decision: String) async {
        isDeciding = true
        defer { isDeciding = false }
        do {
            try await UploadService().writeDecision(scanID: scan.id, decision: decision)
            scan.decision = decision
            decisionError = nil
            onChange(scan)
            Diagnostics.log("past scan \(scan.id.uuidString.lowercased()) decision=\(decision)")
        } catch {
            decisionError = error.localizedDescription
        }
    }

    /// QuickLook needs a local file, so the USDZ is cached by scan id.
    private func downloadModel() async {
        guard localModel == nil else { return }
        guard let remote = scan.modelURL else {
            loadError = "This scan has no model file."
            return
        }
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PastScans", isDirectory: true)
        let destination = folder.appendingPathComponent("\(scan.id.uuidString.lowercased()).usdz")
        if FileManager.default.fileExists(atPath: destination.path) {
            localModel = destination
            return
        }
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let (temporary, response) = try await URLSession.shared.download(from: remote)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                loadError = "The model file couldn't be downloaded."
                return
            }
            try? FileManager.default.removeItem(at: destination)
            try FileManager.default.moveItem(at: temporary, to: destination)
            localModel = destination
        } catch {
            loadError = error.localizedDescription
        }
    }
}
