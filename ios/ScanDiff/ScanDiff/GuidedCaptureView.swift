import RealityKit
import SwiftUI

struct GuidedCaptureView: View {
    @Bindable var model: ScanSessionModel
    var onClose: () -> Void
    @State private var showTips = false
    @State private var confirmClose = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let session = model.session {
                ObjectCaptureView(session: session)
                    .ignoresSafeArea()
                if model.isPassPromptShown {
                    Color.black.opacity(0.45)
                        .ignoresSafeArea()
                        .transition(.opacity)
                }
                VStack(spacing: 12) {
                    topBar(step: step(for: session.state))
                    if !model.isPassPromptShown {
                        if let banner = model.progressBanner {
                            Label(banner, systemImage: "checkmark.circle.fill")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(Color.green.opacity(0.85), in: Capsule())
                                .transition(.move(edge: .top).combined(with: .opacity))
                        } else {
                            QualityBanner(issue: QualityIssue.top(feedback: session.feedback, tracking: session.cameraTracking))
                        }
                    }
                    Spacer(minLength: 0)
                    if model.isPassPromptShown {
                        PassPromptView(model: model)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    } else {
                        InstructionCard(model: model, session: session, onClose: onClose)
                    }
                }
                .padding()
                .environment(\.colorScheme, .dark)
            } else {
                VStack(spacing: 12) {
                    ProgressView()
                        .tint(.white)
                    Text("Starting camera…")
                        .foregroundStyle(.white)
                }
            }
        }
        .animation(.easeInOut(duration: 0.25), value: model.isPassPromptShown)
        .animation(.spring(duration: 0.3), value: model.progressBanner)
        .sensoryFeedback(.success, trigger: model.orbitCompletions)
        .onAppear {
            model.startCaptureIfNeeded()
        }
        .sheet(isPresented: $showTips) {
            NavigationStack {
                ScrollView {
                    ScanningTips().padding()
                }
                .navigationTitle("Scanning tips")
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showTips = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .confirmationDialog("Stop this scan?", isPresented: $confirmClose, titleVisibility: .visible) {
            Button("Discard scan", role: .destructive) {
                model.cancelCapture()
                onClose()
            }
            Button("Keep scanning", role: .cancel) {}
        } message: {
            Text("The \(model.shotCount) photos taken so far will be deleted.")
        }
    }

    private func topBar(step: CaptureStep) -> some View {
        HStack {
            Button {
                if model.shotCount > 0 {
                    confirmClose = true
                } else {
                    model.cancelCapture()
                    onClose()
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.headline)
                    .frame(width: 40, height: 40)
                    .background(CaptureChrome.fill, in: Circle())
            }
            .accessibilityLabel("Close")
            Spacer()
            StepIndicator(current: step, onDark: true)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(CaptureChrome.fill, in: Capsule())
            Spacer()
            Button {
                showTips = true
            } label: {
                Image(systemName: "questionmark")
                    .font(.headline)
                    .frame(width: 40, height: 40)
                    .background(CaptureChrome.fill, in: Circle())
            }
            .accessibilityLabel("Scanning tips")
        }
        .foregroundStyle(.white)
    }

    private func step(for state: ObjectCaptureSession.CaptureState) -> CaptureStep {
        switch state {
        case .initializing, .ready, .detecting: .frame
        case .capturing, .finishing, .completed, .failed: .scan
        @unknown default: .scan
        }
    }
}

/// One instruction and one obvious action for the current capture state.
private struct InstructionCard: View {
    @Bindable var model: ScanSessionModel
    let session: ObjectCaptureSession
    var onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(CaptureChrome.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    @ViewBuilder
    private var content: some View {
        switch session.state {
        case .initializing:
            heading("Starting camera…", "Hold the phone steady.")
            ProgressView()
        case .ready:
            HStack(spacing: 12) {
                if !model.detectionFailed {
                    ProgressView()
                }
                heading("Point at your object", "Center it on screen from about an arm's length away. It's found automatically.")
            }
            if model.detectionFailed {
                note("Couldn't find it. Move a little closer and make sure the whole object is on screen.", warning: true)
                primary("Find object", systemImage: "viewfinder") {
                    model.startDetecting()
                }
            }
        case .detecting where !model.autoStartHeld:
            heading("Object found", "Hold steady: scanning starts automatically.")
            ProgressView(value: model.autoStartProgress ?? 0)
                .tint(.green)
            HStack(spacing: 10) {
                Button {
                    model.holdAutoStart()
                } label: {
                    Text("Let me adjust")
                        .frame(minHeight: 30)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                primary("Start now", systemImage: "record.circle") {
                    model.startCapturing()
                }
            }
        case .detecting:
            heading("Fit the box", "Drag its edges to wrap the object. Keep the table out.")
            HStack(spacing: 10) {
                Button {
                    model.redetect()
                } label: {
                    Text("Find again")
                        .frame(minHeight: 30)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                primary("Start scanning", systemImage: "record.circle") {
                    model.startCapturing()
                }
            }
        case .capturing:
            HStack(alignment: .center, spacing: 16) {
                ShotRing(taken: model.shotCount, needed: ScanQuality.minimumShots)
                VStack(alignment: .leading, spacing: 4) {
                    Text(orbitTitle)
                        .font(.title3.bold())
                    Text("\(model.request.kind.orbitGuidance(model.currentOrbit)), and walk slowly all the way around. Photos are taken automatically.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            if let blocker = model.finishBlocker {
                note(blocker, warning: false)
            } else {
                Button {
                    model.finishCapture()
                } label: {
                    Text("Finish early")
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
        case .finishing:
            heading("Saving photos…", "Keep the app open.")
            ProgressView()
        case .completed:
            heading("Checking coverage…", nil)
            ProgressView()
        case .failed(let error):
            heading("Capture stopped", error.localizedDescription)
            primary("Close", systemImage: "xmark") {
                onClose()
            }
        @unknown default:
            EmptyView()
        }
    }

    private var orbitTitle: String {
        let orbit = model.currentOrbit
        return orbit <= model.plannedOrbits
            ? "Orbit \(orbit) of \(model.plannedOrbits)"
            : (model.didCaptureBottom ? "Bottom orbit" : "Extra orbit")
    }

    private func heading(_ title: String, _ detail: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.title3.bold())
            if let detail {
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func primary(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 30)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
    }

    private func note(_ text: String, warning: Bool) -> some View {
        Label(text, systemImage: warning ? "exclamationmark.triangle.fill" : "info.circle")
            .font(.footnote)
            .foregroundStyle(warning ? .orange : .secondary)
    }
}

/// Solid fills instead of materials: a backdrop blur over the live camera
/// layer makes the GPU re-sample the camera feed every frame.
enum CaptureChrome {
    static let fill = Color.black.opacity(0.55)
    static let card = Color(white: 0.09).opacity(0.88)
}

private struct ShotRing: View {
    let taken: Int
    let needed: Int

    var body: some View {
        let fraction = min(Double(taken) / Double(max(needed, 1)), 1)
        ZStack {
            Circle().stroke(Color(.systemFill), lineWidth: 6)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(fraction >= 1 ? Color.green : Color.accentColor, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.3), value: fraction)
            VStack(spacing: 0) {
                Text("\(taken)")
                    .font(.headline.monospacedDigit())
                Text("photos")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 58, height: 58)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(taken) photos taken, \(needed) needed")
    }
}
