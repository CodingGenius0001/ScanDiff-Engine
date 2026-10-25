import Observation
import SwiftUI

@MainActor
@Observable
final class CaseFileModel {
    let itemID: String
    var caseFile: CaseFile?
    /// The signed-in account's relation to the item, and the code its share links carry.
    var access: ItemAccess?
    var inviteCode: String?
    var loadError: String?
    var isLoaded = false
    var diff: DiffResult?
    var diffError: String?
    var isComparing = false
    var isDeciding = false
    var decisionMessage: String?
    /// The check scan the current `diff` belongs to, so a new check-in triggers a new comparison.
    private var comparedCheckID: UUID?

    init(itemID: String) {
        self.itemID = itemID
    }

    func load() async {
        do {
            if access == nil {
                let items = ItemsService()
                async let role = items.access(itemID: itemID)
                async let code = items.inviteCode(itemID: itemID)
                (access, inviteCode) = try await (role, code)
            }
            if access == .others {
                loadError = "This case file belongs to another account. Open the share link from the seller to join it."
                isLoaded = true
                return
            }
            caseFile = try await CaseFilesService().caseFile(itemID: itemID)
            loadError = nil
        } catch {
            loadError = "Couldn't read this case file: \(error.localizedDescription)"
        }
        isLoaded = true
        if let check = caseFile?.latestCheck, check.id != comparedCheckID, !isComparing {
            await compare()
        }
    }

    /// Re-reads the scans every few seconds, so a check-in or a decision made
    /// on the website shows up here, as the website updates for the phone.
    func watch() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(6))
            guard !Task.isCancelled else { return }
            await load()
        }
    }

    func compare() async {
        guard let caseFile, let check = caseFile.latestCheck else { return }
        isComparing = true
        diffError = nil
        defer { isComparing = false }
        do {
            diff = try await EngineClients.make().diff(baseID: caseFile.baseline.id, newID: check.id)
            comparedCheckID = check.id
            Diagnostics.log("case \(itemID) compared triage=\(diff?.triage.rawValue ?? "?") host=\(diff?.engineHost ?? "none")")
        } catch {
            diffError = error.localizedDescription
        }
    }

    func decide(_ decision: String) async {
        guard let check = caseFile?.latestCheck else { return }
        isDeciding = true
        defer { isDeciding = false }
        do {
            try await UploadService().writeDecision(scanID: check.id, decision: decision)
            decisionMessage = decision == "accept" ? "Saved. The checkout releases the payment." : "Saved. The payment stays held."
            Diagnostics.log("case \(itemID) decision=\(decision) on \(check.id.uuidString.lowercased())")
            await load()
        } catch {
            decisionMessage = error.localizedDescription
        }
    }
}

/// One item's handoff: baseline, check-ins, the comparison and the decision.
struct CaseFileView: View {
    @Environment(AppModel.self) private var appModel
    @State private var model: CaseFileModel
    @State private var sheet: CaseSheet?

    private enum CaseSheet: String, Identifiable {
        case codes, models, baseline
        var id: Self { self }
    }

    init(itemID: String) {
        _model = State(initialValue: CaseFileModel(itemID: itemID))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if let error = model.loadError {
                    Text(error).font(.footnote).foregroundStyle(Theme.stamp)
                }
                if let caseFile = model.caseFile {
                    timeline(caseFile)
                    if caseFile.latestCheck == nil {
                        waitingForCheckIn
                    } else {
                        comparison(caseFile)
                    }
                    actions(caseFile)
                } else if model.isLoaded && model.loadError == nil {
                    Text("No baseline for \(model.itemID) yet. The seller scans one first.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.inkSoft)
                        .panel()
                    if model.access != .member {
                        Button("Scan the baseline") { start(.baseline) }
                            .buttonStyle(KeyButtonStyle())
                    }
                } else if !model.isLoaded {
                    HairlineProgress()
                }
            }
            .padding(20)
        }
        .paperBackground()
        .navigationTitle("Case file")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.paper, for: .navigationBar)
        .task { await model.load() }
        .task { await model.watch() }
        .refreshable { await model.load() }
        .sheet(item: $sheet) { sheet in
            switch sheet {
            case .codes:
                ScanCodesSheet(itemID: model.itemID, invite: model.inviteCode)
            case .models:
                if let diff = model.diff { ModelViewerSheet(diff: diff) }
            case .baseline:
                if let baseline = model.caseFile?.baseline { BaselineModelSheet(scan: baseline) }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Caption("Case file")
            Text(model.itemID)
                .font(Theme.display(38))
                .displayTracking(38)
                .foregroundStyle(Theme.ink)
                .textSelection(.enabled)
            if let caseFile = model.caseFile {
                StatusPill(status: caseFile.status)
            }
        }
    }

    private func timeline(_ caseFile: CaseFile) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Caption("Version timeline")
            TimelineEntry(label: "Exhibit A · Seller baseline", scan: caseFile.baseline)
            ForEach(Array(caseFile.checks.enumerated()), id: \.element.id) { index, check in
                TimelineEntry(label: "Check-in \(index + 1)", scan: check)
            }
            Button {
                sheet = .baseline
            } label: {
                Label("View the baseline model", systemImage: "cube")
            }
            .buttonStyle(OutlineButtonStyle())
        }
        .panel()
    }

    private var waitingForCheckIn: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Waiting for the buyer's check-in scan")
                .font(Theme.display(22))
                .displayTracking(22)
                .foregroundStyle(Theme.inkSoft)
            HairlineProgress()
            Caption("The buyer scans the check-in code from the checkout page when the item arrives. This page updates when the scan lands.")
            Button {
                sheet = .codes
            } label: {
                Label("Show the check-in QR code", systemImage: "qrcode")
            }
            .buttonStyle(OutlineButtonStyle())
        }
        .panel()
    }

    @ViewBuilder
    private func comparison(_ caseFile: CaseFile) -> some View {
        if let diff = model.diff {
            VerdictPanel(diff: diff)
            if diff.heatmapURL != nil {
                Button {
                    sheet = .models
                } label: {
                    Label("View the heat map in 3D", systemImage: "cube.transparent")
                }
                .buttonStyle(KeyButtonStyle(prominent: false))
            }
            if !diff.regions.isEmpty || diff.uncoveredCount > 0 {
                RegionsList(diff: diff)
            }
        } else if model.isComparing {
            VStack(alignment: .leading, spacing: 10) {
                Text("Comparing with the baseline…")
                    .font(Theme.display(22))
                    .displayTracking(22)
                    .foregroundStyle(Theme.ink)
                HairlineProgress()
                Caption("The engine aligns both scans and measures every change. Usually 10–30 seconds.")
            }
            .panel()
        } else if let error = model.diffError {
            VStack(alignment: .leading, spacing: 10) {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(Theme.stamp)
                Button("Try again") { Task { await model.compare() } }
                    .buttonStyle(OutlineButtonStyle())
            }
            .panel()
        }
        DecisionPanel(
            decision: caseFile.latestCheck?.decision,
            isBusy: model.isDeciding,
            message: model.decisionMessage
        ) { decision in
            Task { await model.decide(decision) }
        }
    }

    private func actions(_ caseFile: CaseFile) -> some View {
        VStack(spacing: 10) {
            Button(caseFile.latestCheck == nil ? "Scan the check-in here" : "New check-in scan") { start(.check) }
                .buttonStyle(KeyButtonStyle(prominent: caseFile.latestCheck == nil))
            HStack(spacing: 10) {
                Button {
                    sheet = .codes
                } label: {
                    Label("QR codes", systemImage: "qrcode")
                }
                .buttonStyle(OutlineButtonStyle())
                if model.access == .owner {
                    Button("Re-scan baseline") { start(.baseline) }
                        .buttonStyle(OutlineButtonStyle())
                }
            }
            if let code = model.inviteCode {
                ShareLink(
                    item: WebLinks.join(model.itemID, code: code),
                    subject: Text("ScanDiff: \(model.itemID)"),
                    message: Text("Open this signed in to ScanDiff to see the scans of \(model.itemID) and scan it on arrival.")
                ) {
                    Label(model.access == .owner ? "Share with the buyer" : "Share this case file", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(OutlineButtonStyle())
            }
            HStack(spacing: 18) {
                Link(destination: WebLinks.item(model.itemID)) {
                    Label("Open on scandiff.us", systemImage: "safari")
                }
                Link(destination: WebLinks.checkout(model.itemID)) {
                    Label("Checkout", systemImage: "creditcard")
                }
            }
            .font(.footnote)
            .padding(.top, 4)
        }
    }

    private func start(_ kind: ScanKind) {
        Task { await appModel.startScan(itemID: model.itemID, kind: kind) }
    }
}

private struct TimelineEntry: View {
    let label: String
    let scan: ScanRecord

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(scan.kind == .baseline ? Theme.ink : Theme.stamp)
                .frame(width: 7, height: 7)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(label)
                        .font(.subheadline)
                        .foregroundStyle(Theme.ink)
                    Spacer()
                    if let decision = scan.decision {
                        Text(decision == "accept" ? "Accepted" : "Disputed")
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(decision == "accept" ? Theme.ink : Theme.stamp)
                    }
                }
                if let date = scan.createdAt {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundStyle(Theme.inkSoft)
                }
                if let sha = scan.sha256 {
                    Text("SHA-256 \(sha.prefix(16))…")
                        .font(.caption2.monospaced())
                        .foregroundStyle(Theme.inkFaint)
                }
            }
        }
    }
}

/// The baseline as uploaded (USDZ), in QuickLook; cached by scan id.
private struct BaselineModelSheet: View {
    let scan: ScanRecord
    @Environment(\.dismiss) private var dismiss
    @State private var localModel: URL?
    @State private var loadError: String?

    var body: some View {
        NavigationStack {
            Group {
                if let localModel {
                    ModelPreview(url: localModel)
                } else if let loadError {
                    Text(loadError).foregroundStyle(Theme.stamp).padding()
                } else {
                    VStack(spacing: 10) {
                        HairlineProgress().frame(width: 140)
                        Caption("Loading the baseline model…")
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .paperBackground()
            .navigationTitle("Baseline")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .task { await download() }
        }
    }

    private func download() async {
        guard let remote = scan.modelURL else {
            loadError = "This scan has no model file."
            return
        }
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("CaseFiles", isDirectory: true)
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
