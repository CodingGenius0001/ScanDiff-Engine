import SwiftUI

/// After a baseline upload: the website is waiting for this scan, and the
/// buyer will need the check-in code.
struct SavedScanView: View {
    @Bindable var model: ScanSessionModel
    var onClose: () -> Void
    @State private var showsCodes = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Caption("Seller baseline received")
                Text(model.request.itemID)
                    .font(Theme.display(38))
                    .displayTracking(38)
                    .foregroundStyle(Theme.ink)
                VStack(alignment: .leading, spacing: 8) {
                    if let receipt = model.receipt {
                        SpecRow(label: "Version", value: "\(receipt.version)", mono: true)
                        SpecRow(label: "Scan", value: String(receipt.scanID.uuidString.lowercased().prefix(8)), mono: true)
                    }
                    if let sha = model.prepared?.metadata.model_sha256 {
                        SpecRow(label: "SHA-256", value: "\(sha.prefix(12))…", mono: true)
                    }
                    Caption("Every file is fingerprinted and uploaded. The website's listing updates now.")
                }
                .panel()
                Button {
                    showsCodes = true
                } label: {
                    Label("Show the buyer's check-in code", systemImage: "qrcode")
                }
                .buttonStyle(KeyButtonStyle(prominent: false))
                Button("Open the case file") { onClose() }
                    .buttonStyle(KeyButtonStyle())
            }
            .padding(20)
        }
        .paperBackground()
        .navigationTitle("Saved")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showsCodes) {
            ScanCodesSheet(itemID: model.request.itemID)
        }
    }
}

struct ComparingView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Caption("Comparison")
            Text("Comparing with the baseline…")
                .font(Theme.display(30))
                .displayTracking(30)
                .foregroundStyle(Theme.ink)
            HairlineProgress()
            Caption("The engine aligns both scans and measures every change. Usually 10–30 seconds.")
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .paperBackground()
        .navigationTitle("Comparing")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// After a check-in upload: the comparison and the buyer's decision.
struct DiffResultView: View {
    @Bindable var model: ScanSessionModel
    var onClose: () -> Void
    @State private var showsModels = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Caption("Check-in · \(model.request.itemID)")
                if let diff = model.diff {
                    VerdictPanel(diff: diff)
                    if diff.heatmapURL != nil {
                        Button {
                            showsModels = true
                        } label: {
                            Label("View the heat map in 3D", systemImage: "cube.transparent")
                        }
                        .buttonStyle(KeyButtonStyle(prominent: false))
                    }
                    if !diff.regions.isEmpty || diff.uncoveredCount > 0 {
                        RegionsList(diff: diff)
                    }
                    DecisionPanel(
                        decision: model.decision,
                        isBusy: model.isDeciding,
                        message: model.decisionMessage
                    ) { decision in
                        Task { await model.decide(decision) }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(model.errorMessage ?? "No comparison result.", systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline)
                            .foregroundStyle(Theme.stamp)
                        if model.receipt?.baselineID != nil {
                            Button("Try again") {
                                Task { await model.runDiff() }
                            }
                            .buttonStyle(KeyButtonStyle())
                        }
                        Caption("The scan is uploaded. You can also compare later from its case file.")
                    }
                    .panel()
                }
                Button("Open the case file") { onClose() }
                    .buttonStyle(OutlineButtonStyle())
            }
            .padding(20)
        }
        .paperBackground()
        .navigationTitle("Result")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showsModels) {
            if let diff = model.diff {
                ModelViewerSheet(diff: diff)
            }
        }
    }
}

struct ProcessingFailedView: View {
    var message: String
    var onRetry: () -> Void
    var onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Couldn't build the model")
                    .font(Theme.display(30))
                    .displayTracking(30)
                    .foregroundStyle(Theme.ink)
                Text(message)
                    .foregroundStyle(Theme.inkSoft)
                VStack(alignment: .leading, spacing: 8) {
                    Caption("Your photos are kept. Try processing again, or re-scan with:")
                    Label("Bright, even light (no harsh shadows)", systemImage: "sun.max")
                    Label("A patterned mat or newspaper under the object", systemImage: "square.grid.3x3")
                    Label("Slow, steady orbit; fill most of the frame", systemImage: "arrow.triangle.2.circlepath")
                    Label("For black or shiny items: a little tape or a sticker adds detail", systemImage: "sparkles")
                }
                .font(.subheadline)
                .foregroundStyle(Theme.ink)
                .panel()
                Button {
                    onRetry()
                } label: {
                    Label("Try processing again", systemImage: "arrow.clockwise")
                }
                .buttonStyle(KeyButtonStyle())
                Button("Re-scan") { onClose() }
                    .buttonStyle(OutlineButtonStyle())
            }
            .padding(20)
        }
        .paperBackground()
        .navigationTitle("Processing failed")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct MessageScreen: View {
    var title: String
    var message: String
    var showsTips: Bool
    var onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(message)
                    .foregroundStyle(Theme.ink)
                    .panel()
                if showsTips {
                    ScanningTips()
                }
                Button("Re-scan") { onClose() }
                    .buttonStyle(KeyButtonStyle())
            }
            .padding(20)
        }
        .paperBackground()
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
