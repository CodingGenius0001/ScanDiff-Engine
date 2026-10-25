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

struct ComparingView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
            Text("Comparing with the baseline…")
                .font(.title3.bold())
            Text("The engine aligns both scans and measures every change. This usually takes 10–30 seconds.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle("Comparing")
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
                    coverage(diff)
                    regionList(diff)
                    if let heatmapURL = diff.heatmapURL, !diff.isMock {
                        Link("Open heat map", destination: heatmapURL)
                            .font(.subheadline)
                    }
                    decisionButtons
                } else {
                    Label(model.errorMessage ?? "No comparison result.", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                    if model.receipt?.baselineID != nil {
                        Button("Try again") {
                            Task { await model.runDiff() }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                Button("Done") { onClose() }
                    .buttonStyle(.bordered)
            }
            .padding()
        }
        .navigationTitle("Result")
    }

    private func verdictCard(_ diff: DiffResult) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if diff.isMock {
                Label("MOCK RESULT", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.weight(.heavy))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.orange, in: Capsule())
                    .foregroundStyle(.black)
                    .accessibilityLabel("Mock result, not from the comparison engine")
            }
            Text(diff.headline)
                .font(.title2.bold())
                .foregroundStyle(color(for: diff.triage))
            Text("Confidence \(Int((diff.confidence * 100).rounded()))%")
                .foregroundStyle(.secondary)
            if let reason = diff.reason {
                Text(reason)
                    .font(.subheadline)
            }
            if diff.isMock {
                Text("Not from the comparison engine. Set ENGINE_URL to get a real result.")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
            #if DEBUG
            Text("Engine: \(diff.engineHost ?? "mock (none)")")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
            #endif
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private func coverage(_ diff: DiffResult) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let compared = diff.comparedFraction {
                Text("Compared \(Int((compared * 100).rounded()))% of the surface; \(Int(((1 - compared) * 100).rounded()))% not covered by both scans.")
            } else {
                Text("Compared surface: not reported by the engine.")
            }
            if diff.uncoveredCount > 0 {
                Text("\(diff.uncoveredCount) area\(diff.uncoveredCount == 1 ? "" : "s") only one scan saw (not compared).")
            }
            if let changed = diff.changedFraction {
                Text("\(String(format: "%.1f", changed * 100))% of the surface changed beyond the noise threshold.")
            }
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
    }

    private func regionList(_ diff: DiffResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(diff.regions.count) flagged region\(diff.regions.count == 1 ? "" : "s")")
                .font(.headline)
            ForEach(Array(diff.regions.prefix(12).enumerated()), id: \.element.id) { index, region in
                HStack(alignment: .firstTextBaseline) {
                    Text("\(index + 1)")
                        .font(.caption.monospacedDigit().bold())
                        .frame(width: 22)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(region.title)
                            .font(.subheadline.weight(.semibold))
                        Text(details(region))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(region.triage.title)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(regionColor(region.triage).opacity(0.18), in: Capsule())
                        .foregroundStyle(regionColor(region.triage))
                }
            }
            if diff.regions.count > 12 {
                Text("\(diff.regions.count - 12) more on the web viewer.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var decisionButtons: some View {
        VStack(alignment: .leading, spacing: 8) {
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
        }
    }

    private func details(_ region: DiffRegion) -> String {
        var parts: [String] = []
        if let max = region.maxMM { parts.append(String(format: "up to %.1f mm", max)) }
        if let area = region.areaCM2 { parts.append(String(format: "%.1f cm²", area)) }
        if let confidence = region.confidence { parts.append("\(Int((confidence * 100).rounded()))% sure") }
        return parts.joined(separator: " · ")
    }

    private func color(for triage: Triage) -> Color {
        switch triage {
        case .noChange: .green
        case .wear: .teal
        case .damage: .red
        case .inconclusive: .orange
        }
    }

    private func regionColor(_ triage: RegionTriage) -> Color {
        switch triage {
        case .wear: .teal
        case .damage: .red
        case .inconclusive, .needsReview: .orange
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
                Label("Couldn't build the model", systemImage: "cube.transparent")
                    .font(.title3.bold())
                Text(message)
                Text("Your photos are kept. Try processing again, or re-scan with:")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 6) {
                    Label("Bright, even light (no harsh shadows)", systemImage: "sun.max")
                    Label("A patterned mat or newspaper under the object", systemImage: "square.grid.3x3")
                    Label("Slow, steady orbit; fill most of the frame", systemImage: "arrow.triangle.2.circlepath")
                    Label("For black or shiny items: a little tape or a sticker adds detail", systemImage: "sparkles")
                }
                .font(.subheadline)
                Button {
                    onRetry()
                } label: {
                    Label("Try processing again", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                Button("Re-scan") { onClose() }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
            }
            .padding()
        }
        .navigationTitle("Processing failed")
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
