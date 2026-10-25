import SwiftUI

/// The comparison in 3D: the heat map, and the two scans it came from.
struct ModelViewerSheet: View {
    let diff: DiffResult
    @Environment(\.dismiss) private var dismiss
    @State private var choice: Choice = .heatmap
    @State private var state: GLBViewerState = .loading(0)
    @State private var reloadToken = 0

    enum Choice: String, CaseIterable, Identifiable {
        case heatmap, check, baseline
        var id: Self { self }

        var title: String {
            switch self {
            case .heatmap: "Heat map"
            case .check: "Check scan"
            case .baseline: "Baseline"
            }
        }
    }

    private var choices: [Choice] {
        Choice.allCases.filter { url(for: $0) != nil }
    }

    private func url(for choice: Choice) -> URL? {
        switch choice {
        case .heatmap: diff.heatmapURL
        case .check: diff.newModelURL
        case .baseline: diff.baseModelURL
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                if choices.count > 1 {
                    Picker("Model", selection: $choice) {
                        ForEach(choices) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                }
                ZStack {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(.secondarySystemBackground))
                    if let url = url(for: choice) {
                        GLBViewer(url: url) { state = $0 }
                            .id("\(choice.rawValue)-\(reloadToken)")
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    overlay
                }
                .padding(.horizontal)
                if choice == .heatmap, let legend = diff.legend {
                    HeatmapLegendView(legend: legend)
                        .padding(.horizontal)
                }
                Text(caption)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .padding(.vertical)
            .navigationTitle("3D view")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onChange(of: choice) { state = .loading(0) }
        }
    }

    @ViewBuilder
    private var overlay: some View {
        switch state {
        case .loading(let fraction):
            VStack(spacing: 8) {
                ProgressView(value: fraction > 0 ? fraction : nil)
                    .frame(width: 160)
                Text("Loading model…").font(.footnote).foregroundStyle(.secondary)
            }
            .allowsHitTesting(false)
        case .loaded:
            EmptyView()
        case .failed(let message):
            VStack(spacing: 10) {
                Label(message, systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                Button("Try again") { reloadToken += 1 }
                    .buttonStyle(.bordered)
            }
            .padding()
        }
    }

    private var caption: String {
        switch choice {
        case .heatmap: "The check scan, colored by how far each spot moved from the baseline. Drag to turn, pinch to zoom."
        case .check: "The check scan, aligned to the baseline."
        case .baseline: "The baseline scan."
        }
    }
}

/// Matches the engine's baked colors (scandiff/heatmap.py).
struct HeatmapLegendView: View {
    let legend: HeatmapLegend

    private static let dent = Color(red: 37 / 255, green: 99 / 255, blue: 235 / 255)
    private static let neutral = Color(red: 200 / 255, green: 200 / 255, blue: 200 / 255)
    private static let added = Color(red: 220 / 255, green: 38 / 255, blue: 38 / 255)

    var body: some View {
        VStack(spacing: 4) {
            GeometryReader { proxy in
                let span = max(legend.maxMM - legend.minMM, 0.001)
                let neutralStart = (-legend.neutralBandMM - legend.minMM) / span
                let neutralEnd = (legend.neutralBandMM - legend.minMM) / span
                LinearGradient(
                    stops: [
                        .init(color: Self.dent, location: 0),
                        .init(color: Self.neutral, location: max(0, min(1, neutralStart))),
                        .init(color: Self.neutral, location: max(0, min(1, neutralEnd))),
                        .init(color: Self.added, location: 1)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(width: proxy.size.width, height: 10)
                .clipShape(Capsule())
            }
            .frame(height: 10)
            HStack {
                Text("Dent \(Self.mm(legend.minMM))")
                Spacer()
                Text("Unchanged ±\(Self.mm(legend.neutralBandMM))")
                Spacer()
                Text("Added +\(Self.mm(legend.maxMM))")
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private static func mm(_ value: Double) -> String {
        "\(String(format: "%g", (value * 10).rounded() / 10)) mm"
    }
}
