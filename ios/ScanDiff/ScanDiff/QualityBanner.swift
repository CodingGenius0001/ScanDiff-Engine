import RealityKit
import SwiftUI

enum QualityIssue: Equatable {
    case tooDark
    case trackingLost
    case notEnoughTexture
    case movingTooFast
    case outOfView
    case notDetected
    case tooClose
    case tooFar
    case holdSteady
    case lowLight
    case overCapturing

    var message: String {
        switch self {
        case .tooDark: "Too dark. Add more light."
        case .trackingLost: "Lost track. Point back at the object."
        case .notEnoughTexture: "Not enough detail to track. Add light or a patterned mat underneath."
        case .movingTooFast: "Slow down"
        case .outOfView: "Point the camera at the object"
        case .notDetected: "Can't see the object. Center it on screen."
        case .tooClose: "Move back a little"
        case .tooFar: "Move closer"
        case .holdSteady: "Hold steady…"
        case .lowLight: "More light would help"
        case .overCapturing: "Plenty of photos here. Move to a new angle."
        }
    }

    var symbol: String {
        switch self {
        case .tooDark, .lowLight: "sun.max.fill"
        case .trackingLost, .outOfView, .notDetected: "scope"
        case .notEnoughTexture: "square.grid.3x3.fill"
        case .movingTooFast: "tortoise.fill"
        case .tooClose: "arrow.up.left.and.arrow.down.right"
        case .tooFar: "arrow.down.right.and.arrow.up.left"
        case .holdSteady: "hand.raised.fill"
        case .overCapturing: "arrow.triangle.turn.up.right.circle.fill"
        }
    }

    /// Blocking issues stop photos from being taken.
    var isBlocking: Bool {
        switch self {
        case .lowLight, .overCapturing, .holdSteady: false
        default: true
        }
    }

    /// Most important first, so only one message shows at a time.
    static func top(
        feedback: Set<ObjectCaptureSession.Feedback>,
        tracking: ObjectCaptureSession.Tracking
    ) -> QualityIssue? {
        if feedback.contains(.environmentTooDark) { return .tooDark }
        switch tracking {
        case .notAvailable:
            return .trackingLost
        case .limited(let reason):
            switch reason {
            case .insufficientFeatures: return .notEnoughTexture
            case .excessiveMotion: return .movingTooFast
            case .initializing, .relocalizing: return .holdSteady
            @unknown default: return .holdSteady
            }
        case .normal:
            break
        @unknown default:
            break
        }
        if feedback.contains(.movingTooFast) { return .movingTooFast }
        if feedback.contains(.outOfFieldOfView) { return .outOfView }
        if #available(iOS 17.4, *), feedback.contains(.objectNotDetected) { return .notDetected }
        if feedback.contains(.objectTooClose) { return .tooClose }
        if feedback.contains(.objectTooFar) { return .tooFar }
        if feedback.contains(.environmentLowLight) { return .lowLight }
        if feedback.contains(.overCapturing) { return .overCapturing }
        return nil
    }
}

/// Shows an issue only once it has held for a moment, so flickering feedback
/// doesn't cause constant animation and haptics during capture.
struct QualityBanner: View {
    let issue: QualityIssue?
    @State private var shown: QualityIssue?

    var body: some View {
        ZStack {
            if let issue = shown {
                Label(issue.message, systemImage: issue.symbol)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(
                        (issue.isBlocking ? Color.orange : Color.black.opacity(0.55)),
                        in: Capsule()
                    )
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .id(issue)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .animation(.spring(duration: 0.3), value: shown)
        .task(id: issue) {
            try? await Task.sleep(for: .milliseconds(issue == nil ? 700 : 400))
            guard !Task.isCancelled else { return }
            shown = issue
        }
        .sensoryFeedback(trigger: shown) { _, newIssue in
            (newIssue?.isBlocking ?? false) ? .warning : nil
        }
    }
}
