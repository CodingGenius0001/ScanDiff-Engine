import SwiftUI

struct PreflightView: View {
    let request: ScanRequest
    var onReady: () -> Void
    var onCancel: () -> Void

    private let items: [(symbol: String, title: String, detail: String)] = [
        ("cube", "Matte object", "Shiny, see-through, or very dark objects don't scan well."),
        ("lightbulb.max", "Bright, even light", "Avoid harsh shadows and direct sunlight."),
        ("table.furniture", "Plain, clear table", "Leave space around the object and remove clutter."),
        ("figure.walk.circle", "Room to walk around it", "You'll circle the object two or three times."),
        ("hand.raised", "Keep the object still", "You move, not the object. Only flip it when the app asks."),
        ("powerplug", "Same setup every time", "Remove cords and loose parts, or place them exactly as in the baseline. Moved parts show up as damage.")
    ]

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 8) {
                        StepIndicator(current: .prepare)
                        Text("Before you scan")
                            .font(.largeTitle.bold())
                        Text("\(request.kind.title) scan of \(request.itemID)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    VStack(alignment: .leading, spacing: 18) {
                        ForEach(items, id: \.title) { item in
                            HStack(alignment: .top, spacing: 14) {
                                Image(systemName: item.symbol)
                                    .font(.title3)
                                    .foregroundStyle(Color.accentColor)
                                    .frame(width: 32)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title).font(.headline)
                                    Text(item.detail)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                .padding(24)
            }
            VStack(spacing: 10) {
                Button(action: onReady) {
                    Text("I'm ready")
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                Button("Cancel", role: .cancel, action: onCancel)
            }
            .padding(24)
            .background(.bar)
        }
    }
}

enum CaptureStep: Int, CaseIterable {
    case prepare = 1
    case frame
    case scan
    case process

    var title: String {
        switch self {
        case .prepare: "Prepare"
        case .frame: "Frame"
        case .scan: "Scan"
        case .process: "Process"
        }
    }
}

struct StepIndicator: View {
    let current: CaptureStep
    var onDark = false

    var body: some View {
        HStack(spacing: 6) {
            ForEach(CaptureStep.allCases, id: \.self) { step in
                Capsule()
                    .fill(step.rawValue <= current.rawValue ? Color.accentColor : inactiveColor)
                    .frame(width: step == current ? 22 : 8, height: 8)
            }
            Text("Step \(current.rawValue) of \(CaptureStep.allCases.count) · \(current.title)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(onDark ? .white : .secondary)
                .padding(.leading, 4)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Step \(current.rawValue) of \(CaptureStep.allCases.count), \(current.title)")
    }

    private var inactiveColor: Color {
        onDark ? .white.opacity(0.35) : Color(.systemFill)
    }
}
