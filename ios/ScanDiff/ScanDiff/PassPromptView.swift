import SwiftUI

/// Shown with capture paused each time an orbit completes, so the screen
/// clearly reads as paused rather than frozen.
struct PassPromptView: View {
    @Bindable var model: ScanSessionModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Scanning paused", systemImage: "pause.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 6) {
                Text("Orbit \(model.completedPasses) done")
                    .font(.title2.bold())
                Text(guidance)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            VStack(spacing: 10) {
                if model.canFlipObject {
                    choice("I flipped it, keep going", systemImage: "arrow.triangle.2.circlepath", prominent: true) {
                        model.beginNextPass(flip: true)
                    }
                }
                choice(nextAngleTitle, systemImage: "camera.rotate", prominent: !model.canFlipObject) {
                    model.beginNextPass(flip: false)
                }
                if !model.canFlipObject {
                    choice("I laid it on its side anyway", systemImage: "arrow.triangle.2.circlepath", prominent: false) {
                        model.beginNextPass(flip: true, overrideNotFlippable: true)
                    }
                }
                choice("Finish scan", systemImage: "checkmark", prominent: false) {
                    model.finishFromPrompt()
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(CaptureChrome.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var nextAngleTitle: String {
        model.completedPasses == 1 ? "Go around again, from higher up" : "Go around again, low, looking up"
    }

    private var guidance: String {
        if model.canFlipObject {
            return "To capture the bottom, gently lay the object on its side, then tap \"I flipped it\". Or circle it again from a different height."
        }
        return "The bottom can only be captured if the object is laid on its side. If that's safe (empty it first, keep cords in place), lay it down and tap \"anyway\". Otherwise circle again from a different height; the underside will stay uncaptured."
    }

    @ViewBuilder
    private func choice(_ title: String, systemImage: String, prominent: Bool, action: @escaping () -> Void) -> some View {
        if prominent {
            Button(action: action) {
                Label(title, systemImage: systemImage)
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 30)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        } else {
            Button(action: action) {
                Label(title, systemImage: systemImage)
                    .frame(maxWidth: .infinity, minHeight: 30)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
        }
    }
}
