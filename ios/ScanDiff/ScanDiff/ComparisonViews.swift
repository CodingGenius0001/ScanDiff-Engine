import SwiftUI

/// The verdict, as the website's VerdictBanner shows it.
struct VerdictPanel: View {
    let diff: DiffResult

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if diff.isMock {
                Label("MOCK RESULT", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.weight(.heavy))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.orange, in: Capsule())
                    .foregroundStyle(.black)
                    .accessibilityLabel("Mock result, not from the comparison engine")
            }
            Caption("Verdict")
            Text(diff.headline)
                .font(Theme.display(30))
                .displayTracking(30)
                .foregroundStyle(diff.triage == .noChange || diff.triage == .wear ? Theme.ink : Theme.stamp)
            if let reason = diff.reason {
                Text(reason)
                    .font(.subheadline)
                    .foregroundStyle(Theme.inkSoft)
            }
            VStack(spacing: 6) {
                SpecRow(label: "Confidence", value: "\(Int((diff.confidence * 100).rounded()))%", mono: true)
                if let max = diff.maxChangeMM {
                    SpecRow(label: "Largest change", value: String(format: "%.1f mm", max), mono: true)
                }
                if let changed = diff.changedFraction {
                    SpecRow(label: "Above threshold", value: String(format: "%.1f%% of surface", changed * 100), mono: true)
                }
                SpecRow(
                    label: "Covered by both scans",
                    value: diff.comparedFraction.map { "\(Int(($0 * 100).rounded()))%" } ?? "not reported",
                    mono: true
                )
            }
            .padding(.top, 4)
            if diff.isMock {
                Text("Not from the comparison engine. Set ENGINE_URL to get a real result.")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
            #if DEBUG
            Text("Engine: \(diff.engineHost ?? "mock (none)")")
                .font(.caption2.monospaced())
                .foregroundStyle(Theme.inkFaint)
            #endif
        }
        .panel()
    }
}

/// Flagged regions, numbered as on the website.
struct RegionsList: View {
    let diff: DiffResult
    var limit = 12

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(diff.regions.count) flagged region\(diff.regions.count == 1 ? "" : "s")")
                .font(.headline.weight(.regular))
                .foregroundStyle(Theme.ink)
            if diff.uncoveredCount > 0 {
                Caption("\(diff.uncoveredCount) area\(diff.uncoveredCount == 1 ? "" : "s") only one scan saw: no data, never damage.")
            }
            ForEach(Array(diff.regions.prefix(limit).enumerated()), id: \.element.id) { index, region in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(String(format: "%02d", index + 1))
                        .font(.caption.monospaced())
                        .foregroundStyle(Theme.inkFaint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(region.title)
                            .font(.subheadline)
                            .foregroundStyle(Theme.ink)
                        Text(details(region))
                            .font(.caption)
                            .foregroundStyle(Theme.inkSoft)
                    }
                    Spacer()
                    Text(region.triage.title)
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .foregroundStyle(region.triage == .wear ? Theme.inkSoft : Theme.stamp)
                        .overlay(Capsule().strokeBorder(region.triage == .wear ? Theme.rule : Theme.stamp.opacity(0.6), lineWidth: 1))
                }
            }
            if diff.regions.count > limit {
                Caption("\(diff.regions.count - limit) more on the website.")
            }
        }
        .panel()
    }

    private func details(_ region: DiffRegion) -> String {
        var parts: [String] = []
        if let max = region.maxMM { parts.append(String(format: "up to %.1f mm", max)) }
        if let area = region.areaCM2 { parts.append(String(format: "%.1f cm²", area)) }
        if let confidence = region.confidence { parts.append("\(Int((confidence * 100).rounded()))% sure") }
        return parts.joined(separator: " · ")
    }
}

/// Accept releases the demo payment; dispute keeps it held. Written on the
/// check scan's row, the same field the website writes.
struct DecisionPanel: View {
    let decision: String?
    let isBusy: Bool
    var message: String?
    let onDecide: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Caption("Buyer's decision")
            switch decision {
            case "accept":
                Text("Accepted: payment released (demo)")
                    .font(.headline.weight(.regular))
                    .foregroundStyle(Theme.ink)
            case "dispute":
                Text("Disputed: payment stays held (demo)")
                    .font(.headline.weight(.regular))
                    .foregroundStyle(Theme.stamp)
            default:
                Text("Accept the comparison to release the payment, or dispute it to keep it held with the evidence.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.inkSoft)
            }
            HStack(spacing: 10) {
                Button(decision == "accept" ? "Accepted" : "Accept") { onDecide("accept") }
                    .buttonStyle(KeyButtonStyle(prominent: decision != "dispute"))
                    .disabled(isBusy || decision == "accept")
                Button(decision == "dispute" ? "Disputed" : "Dispute") { onDecide("dispute") }
                    .buttonStyle(OutlineButtonStyle())
                    .disabled(isBusy || decision == "dispute")
            }
            if isBusy {
                HairlineProgress()
            }
            if let message {
                Text(message).font(.footnote).foregroundStyle(Theme.inkSoft)
            }
            Caption("Demo only, no real payment.")
        }
        .panel()
    }
}
