import SwiftUI

/// Shown once, with capture paused, after a baseline's planned orbits: the
/// only point where the scan waits for a decision (capturing the bottom).
struct PassPromptView: View {
    @Bindable var model: ScanSessionModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Scanning paused", systemImage: "pause.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 6) {
                Text(model.didCaptureBottom ? "Bottom captured" : "Capture the bottom?")
                    .font(.title2.bold())
                Text(guidance)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            VStack(spacing: 10) {
                if model.didCaptureBottom {
                    choice("Finish scan", systemImage: "checkmark", prominent: true) {
                        model.finishFromPrompt()
                    }
                } else if model.canFlipObject {
                    choice("I flipped it, scan the bottom", systemImage: "arrow.triangle.2.circlepath", prominent: true) {
                        model.beginNextPass(flip: true)
                    }
                    choice("Finish without the bottom", systemImage: "checkmark", prominent: false) {
                        model.finishFromPrompt()
                    }
                } else {
                    choice("Finish without the bottom", systemImage: "checkmark", prominent: true) {
                        model.finishFromPrompt()
                    }
                    choice("I laid it on its side anyway", systemImage: "arrow.triangle.2.circlepath", prominent: false) {
                        model.beginNextPass(flip: true, overrideNotFlippable: true)
                    }
                }
                choice("One more orbit, low and looking up", systemImage: "camera.rotate", prominent: false) {
                    model.beginNextPass(flip: false)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(CaptureChrome.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var guidance: String {
        if model.didCaptureBottom {
            return "Top, sides and bottom are covered. Finish, or add a low orbit for extra detail on the sides."
        }
        if model.canFlipObject {
            return "Damage on the underside only shows up if the bottom is scanned. Gently lay the object on its side, then continue."
        }
        return "Object Capture thinks this object can't be flipped. If it's safe (emptied, cords in place), lay it on its side and scan the bottom. Otherwise the underside is marked as not covered."
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
