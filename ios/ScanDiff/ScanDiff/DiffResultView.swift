import SwiftUI

struct SavedScanView: View {
    @Bindable var model: ScanSessionModel
    var onClose: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 48))
                .foregroundStyle(.green)
            Text("Baseline uploaded")
                .font(.title2.bold())
            if let receipt = model.receipt {
                Text("Version \(receipt.version)")
                    .foregroundStyle(.secondary)
            }
            Button("Done") { onClose() }
                .buttonStyle(.borderedProminent)
        }
        .padding()
        .navigationTitle("Saved")
    }
}

struct DiffResultView: View {
    @Bindable var model: ScanSessionModel
    var onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let diff = model.diff {
                    verdictCard(diff)
                    Text("\(diff.regions.count) flagged regions")
                        .font(.headline)
                    ForEach(diff.regions) { region in
                        HStack {
                            Text(region.label)
                            Spacer()
                            if let score = region.score {
                                Text(score, format: .number.precision(.fractionLength(2)))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    if !diff.histogramBins.isEmpty {
                        Text("Histogram bins: \(diff.histogramBins.count)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    if let heatmapURL = diff.heatmapURL {
                        Link("Open heatmap", destination: heatmapURL)
                    }
                    if diff.usedMock {
                        Text("Mock diff. ENGINE_URL is empty, so this result is not from the engine.")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }
                    HStack {
                        Button("Accept") {
                            Task { await model.decide("accept") }
                        }
                        .buttonStyle(.borderedProminent)
                        Button("Dispute") {
                            Task { await model.decide("dispute") }
                        }
                        .buttonStyle(.bordered)
                    }
                    .disabled(model.isDeciding || model.receipt == nil)
                    if let decisionMessage = model.decisionMessage {
                        Text(decisionMessage)
                            .font(.footnote)
                    }
                } else if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                }
                Button("Done") { onClose() }
                    .buttonStyle(.bordered)
            }
            .padding()
        }
        .navigationTitle("Diff")
    }

    private func verdictCard(_ diff: DiffResult) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(diff.verdict)
                .font(.title2.bold())
            Text("Confidence \(Int((diff.confidence * 100).rounded()))%")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
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
                if showsTips {
                    ScanningTips()
                }
                Button("Re-scan") { onClose() }
                    .buttonStyle(.borderedProminent)
            }
            .padding()
        }
        .navigationTitle(title)
    }
}
