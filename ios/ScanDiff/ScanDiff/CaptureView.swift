import RealityKit
import SwiftUI

struct CaptureView: View {
    @Bindable var model: ScanSessionModel
    var onClose: () -> Void
    @State private var detectionFailed = false
    @State private var showTips = false

    var body: some View {
        ZStack {
            if let session = model.session {
                ObjectCaptureView(session: session)
                    .ignoresSafeArea()
                controls(session)
            } else {
                ProgressView("Preparing the camera…")
            }
        }
        .task {
            model.prepareCapture()
            while !Task.isCancelled {
                model.syncCaptureSession()
                try? await Task.sleep(for: .milliseconds(300))
            }
        }
        .sheet(isPresented: $showTips) {
            NavigationStack {
                ScanningTips()
                    .padding()
                    .navigationTitle("Tips")
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { showTips = false }
                        }
                    }
            }
            .presentationDetents([.medium])
        }
    }

    @ViewBuilder
    private func controls(_ session: ObjectCaptureSession) -> some View {
        VStack(spacing: 12) {
            HStack {
                Button("Close") {
                    model.cancelCapture()
                    onClose()
                }
                .buttonStyle(.bordered)
                Spacer()
                Button("Tips") { showTips = true }
                    .buttonStyle(.bordered)
            }
            VStack(alignment: .leading, spacing: 6) {
                ProgressView(value: model.coverage) {
                    Text(model.completedOrbit ? "Loop complete" : "Coverage")
                }
                Text("\(max(model.shotCount, session.numberOfShotsTaken)) shots · need \(ScanQuality.minimumShots) and one full loop")
                    .font(.footnote)
            }
            .padding(12)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))

            Spacer()

            if !feedbackText(session.feedback).isEmpty {
                Text(feedbackText(session.feedback))
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .padding(12)
                    .frame(maxWidth: .infinity)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
            }

            actionButtons(session)
        }
        .padding()
    }

    @ViewBuilder
    private func actionButtons(_ session: ObjectCaptureSession) -> some View {
        switch session.state {
        case .initializing:
            ProgressView("Starting camera…")
        case .ready:
            Button("Detect object") {
                detectionFailed = !session.startDetecting()
            }
            .buttonStyle(.borderedProminent)
            if detectionFailed {
                Text("Could not start detection. Move the phone and try again.")
                    .font(.footnote)
            }
        case .detecting:
            VStack(spacing: 8) {
                Text("Point at the object until the box looks right.")
                    .font(.subheadline)
                Button("Start capture") {
                    session.startCapturing()
                }
                .buttonStyle(.borderedProminent)
            }
        case .capturing:
            VStack(spacing: 8) {
                Text("Walk slowly all the way around. The phone takes the photos.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                if session.userCompletedScanPass {
                    Button("Flip and continue") {
                        session.beginNewScanPassAfterFlip()
                    }
                    .buttonStyle(.bordered)
                }
                Button("Finish scan") {
                    session.finish()
                }
                .buttonStyle(.borderedProminent)
            }
        case .finishing:
            ProgressView("Saving photos…")
        case .completed:
            ProgressView("Checking coverage…")
        case .failed(let error):
            Text(error.localizedDescription)
                .foregroundStyle(.red)
        @unknown default:
            EmptyView()
        }
    }

    private func feedbackText(_ feedback: Set<ObjectCaptureSession.Feedback>) -> String {
        var lines: [String] = []
        if feedback.contains(.objectTooFar) { lines.append("Move closer") }
        if feedback.contains(.objectTooClose) { lines.append("Move farther away") }
        if feedback.contains(.environmentTooDark) { lines.append("More light required") }
        if feedback.contains(.environmentLowLight) { lines.append("More light recommended") }
        if feedback.contains(.movingTooFast) { lines.append("Move slower") }
        if feedback.contains(.outOfFieldOfView) { lines.append("Aim at the object") }
        return lines.joined(separator: "\n")
    }
}
