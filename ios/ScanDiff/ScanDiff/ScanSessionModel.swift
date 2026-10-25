import Foundation
import Observation
import RealityKit
import SwiftUI
import UIKit

@MainActor
@Observable
final class ScanSessionModel {
    let request: ScanRequest
    let scanID: UUID
    let folders: CaptureFolders

    private let processingService = ProcessingService()
    private var didStartProcessing = false
    private var observationTasks: [Task<Void, Never>] = []
    private var autoDetectTask: Task<Void, Never>?
    private var bannerTask: Task<Void, Never>?

    var stage: ScanStage = .preflight
    var session: ObjectCaptureSession?
    var shotCount = 0
    var completedOrbit = false
    var completedPasses = 0
    var isPassPromptShown = false
    var detectionFailed = false
    /// Short-lived guidance shown when the app moves on by itself.
    var progressBanner: String?
    /// Bumped each time an orbit completes, to drive a success haptic.
    var orbitCompletions = 0
    var didCaptureBottom = false

    var currentOrbit: Int { completedPasses + 1 }
    var plannedOrbits: Int { request.kind.plannedOrbits }
    var progress = 0.0
    var statusMessage = "Reconstructing the model…"
    var prepared: PreparedScan?
    var receipt: UploadReceipt?
    var diff: DiffResult?
    var poseWarning: String?
    var errorMessage: String?
    var decisionMessage: String?
    var isDeciding = false

    /// Why Finish is unavailable right now, or nil when the scan can finish.
    var finishBlocker: String? {
        let missing = ScanQuality.minimumShots - shotCount
        if missing > 0 {
            return "Keep going: \(missing) more photo\(missing == 1 ? "" : "s") needed."
        }
        if !completedOrbit {
            return "Finish one full loop around the object first."
        }
        return nil
    }

    var coverage: Double {
        let shots = min(Double(shotCount) / Double(ScanQuality.minimumShots), 1)
        let orbit = completedOrbit ? 1.0 : 0
        return min(1, (shots * 0.7) + (orbit * 0.3))
    }

    init(request: ScanRequest) throws {
        self.request = request
        self.scanID = UUID()
        self.folders = try CaptureFolders.make(scanID: scanID)
        Diagnostics.log("scan created \(scanID.uuidString) item=\(request.itemID) kind=\(request.kind.rawValue)")
    }

    // MARK: - Capture

    func confirmPreflight() {
        guard case .preflight = stage else { return }
        Diagnostics.log("preflight confirmed")
        stage = .capture
    }

    /// Creates the capture session and subscribes to its updates. The
    /// subscriptions are owned here and cancelled before reconstruction so the
    /// camera session is released, as Apple's sample does.
    func startCaptureIfNeeded() {
        guard session == nil, case .capture = stage else { return }
        guard ObjectCaptureSession.isSupported else {
            stage = .failed(ScanError.unsupportedDevice.errorDescription ?? "Unsupported device.")
            return
        }
        let objectSession = ObjectCaptureSession()
        var configuration = ObjectCaptureSession.Configuration()
        configuration.checkpointDirectory = folders.checkpoint
        configuration.isOverCaptureEnabled = true
        objectSession.start(imagesDirectory: folders.images, configuration: configuration)
        session = objectSession
        UIApplication.shared.isIdleTimerDisabled = true
        Diagnostics.log("capture session started")
        observe(objectSession)
    }

    private func observe(_ session: ObjectCaptureSession) {
        let shots = session.numberOfShotsTakenUpdates
        let passes = session.userCompletedScanPassUpdates
        let states = session.stateUpdates
        observationTasks = [
            Task { [weak self] in
                for await count in shots {
                    guard let self else { return }
                    self.shotCount = count
                    if count % 10 == 0 { Diagnostics.log("shots=\(count)") }
                }
            },
            Task { [weak self] in
                for await passDone in passes where passDone {
                    self?.passCompleted()
                }
            },
            Task { [weak self] in
                for await state in states {
                    Diagnostics.log("capture state -> \(Self.describe(state))")
                    self?.handle(state)
                }
            }
        ]
    }

    private func releaseCaptureSession() {
        observationTasks.forEach { $0.cancel() }
        observationTasks.removeAll()
        autoDetectTask?.cancel()
        autoDetectTask = nil
        bannerTask?.cancel()
        progressBanner = nil
        session = nil
        isPassPromptShown = false
        UIApplication.shared.isIdleTimerDisabled = false
        Diagnostics.log("capture session released")
    }

    func startDetecting() {
        guard let session else { return }
        autoDetectTask?.cancel()
        detectionFailed = !session.startDetecting()
        Diagnostics.log("startDetecting ok=\(!detectionFailed)")
    }

    /// Tries to find the object on its own once tracking is steady and the
    /// object is in view, so the user doesn't have to tap. The manual button
    /// stays as a fallback.
    private func scheduleAutoDetect() {
        autoDetectTask?.cancel()
        autoDetectTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1.5))
            for _ in 0..<20 {
                guard !Task.isCancelled, let self, let session = self.session,
                      session.state == .ready else { return }
                let steady = session.cameraTracking == .normal
                    && !session.feedback.contains(.outOfFieldOfView)
                    && !session.feedback.contains(.movingTooFast)
                if steady, session.startDetecting() {
                    Diagnostics.log("auto-detect found the object")
                    self.detectionFailed = false
                    return
                }
                try? await Task.sleep(for: .seconds(1.5))
            }
            self?.detectionFailed = true
        }
    }

    private func showBanner(_ message: String) {
        progressBanner = message
        bannerTask?.cancel()
        bannerTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            self?.progressBanner = nil
        }
    }

    func redetect() {
        guard let session else { return }
        detectionFailed = !session.resetDetection()
        Diagnostics.log("resetDetection ok=\(!detectionFailed)")
    }

    func startCapturing() {
        Diagnostics.log("startCapturing")
        session?.startCapturing()
    }

    func finishCapture() {
        guard finishBlocker == nil else { return }
        Diagnostics.log("finish tapped shots=\(shotCount)")
        session?.finish()
    }

    var canFlipObject: Bool {
        guard let session else { return false }
        return !session.feedback.contains(.objectNotFlippable)
    }

    /// Starts the next orbit. Object Capture requires the pass to be complete
    /// before a flip; the prompt keeps the session paused until the choice.
    func beginNextPass(flip: Bool, overrideNotFlippable: Bool = false) {
        guard let session, session.userCompletedScanPass else {
            Diagnostics.log("beginNextPass ignored: pass not complete")
            dismissPassPrompt()
            return
        }
        if flip && (canFlipObject || overrideNotFlippable) {
            didCaptureBottom = true
            Diagnostics.log("beginNewScanPassAfterFlip")
            session.beginNewScanPassAfterFlip()
        } else {
            Diagnostics.log("beginNewScanPass")
            session.beginNewScanPass()
        }
        dismissPassPrompt()
    }

    func finishFromPrompt() {
        Diagnostics.log("finish from prompt shots=\(shotCount)")
        isPassPromptShown = false
        session?.finish()
    }

    private func dismissPassPrompt() {
        isPassPromptShown = false
        session?.resume()
        Diagnostics.log("session resumed")
    }

    /// Moves through the orbit plan without stopping: the next orbit starts on
    /// its own, a check finishes on its own, and only a baseline pauses once
    /// at the end to offer the bottom pass.
    private func passCompleted() {
        guard case .capture = stage, let session, !isPassPromptShown else { return }
        completedOrbit = true
        completedPasses += 1
        orbitCompletions += 1
        Diagnostics.log("pass \(completedPasses)/\(plannedOrbits) complete shots=\(shotCount) flippable=\(canFlipObject)")

        if completedPasses < plannedOrbits || finishBlocker != nil {
            session.pause()
            session.beginNewScanPass()
            session.resume()
            let next = request.kind.orbitGuidance(currentOrbit)
            showBanner(finishBlocker.map { "Keep circling. \($0)" } ?? "Orbit \(completedPasses) done. \(next).")
            Diagnostics.log("auto-advanced to orbit \(currentOrbit)")
            return
        }

        switch request.kind {
        case .check:
            Diagnostics.log("auto-finish check scan")
            session.finish()
        case .baseline:
            session.pause()
            isPassPromptShown = true
        }
    }

    private func handle(_ state: ObjectCaptureSession.CaptureState) {
        switch state {
        case .ready:
            scheduleAutoDetect()
        case .completed:
            finishCaptureIfNeeded()
        case .failed(let error):
            if case ObjectCaptureSession.Error.cancelled = error { return }
            fail(error.localizedDescription)
        default:
            break
        }
    }

    private func finishCaptureIfNeeded() {
        guard case .capture = stage else { return }
        releaseCaptureSession()
        let quality = ScanQuality(shotCount: shotCount, completedOrbit: completedOrbit, savedPhotoCount: 0)
        if let rejection = quality.rejection {
            Diagnostics.log("capture rejected: \(rejection)")
            stage = .rejected(rejection)
        } else {
            stage = .processing
        }
    }

    private func fail(_ message: String) {
        guard case .capture = stage else { return }
        Diagnostics.log("capture failed: \(message)")
        releaseCaptureSession()
        stage = .failed(message)
    }

    func cancelCapture() {
        Diagnostics.log("capture cancelled by user")
        session?.cancel()
        releaseCaptureSession()
    }

    private static func describe(_ state: ObjectCaptureSession.CaptureState) -> String {
        switch state {
        case .initializing: "initializing"
        case .ready: "ready"
        case .detecting: "detecting"
        case .capturing: "capturing"
        case .finishing: "finishing"
        case .completed: "completed"
        case .failed(let error): "failed(\(error.localizedDescription))"
        @unknown default: "unknown"
        }
    }

    // MARK: - Processing

    func runProcessing() async {
        guard !didStartProcessing else { return }
        didStartProcessing = true
        UIApplication.shared.isIdleTimerDisabled = true
        defer { UIApplication.shared.isIdleTimerDisabled = false }
        let output = folders.bundle.appendingPathComponent(ScanBundle.modelFileName)
        Diagnostics.log("reconstruction start")
        do {
            var lastLoggedDecile = -1
            let poses = try await processingService.process(
                imagesDirectory: folders.images,
                checkpointDirectory: folders.checkpoint,
                outputURL: output,
                onProgress: { [weak self] fraction in
                    self?.progress = fraction
                    let percent = Int((fraction * 100).rounded())
                    self?.statusMessage = "Reconstructing the model… \(percent)%"
                    if percent / 10 != lastLoggedDecile {
                        lastLoggedDecile = percent / 10
                        Diagnostics.log("reconstruction \(percent)%")
                    }
                }
            )
            Diagnostics.log("reconstruction done, poses=\(poses?.posesBySample.count ?? 0)")
            statusMessage = "Cleaning the mesh and packaging the scan…"
            let input = ScanBundle.Input(
                scanID: scanID,
                request: request,
                imagesDirectory: folders.images,
                modelUSDZ: output,
                bundleDirectory: folders.bundle,
                createdBy: SupabaseProvider.client?.auth.currentUser?.id.uuidString.lowercased() ?? "signed-out",
                device: DeviceInfo.modelIdentifier,
                iosVersion: DeviceInfo.systemVersion,
                imageCount: shotCount
            )
            let prepared = try await Task.detached(priority: .userInitiated) {
                try ScanBundle.make(input, poses: poses)
            }.value
            Diagnostics.log("bundle written photos=\(prepared.metadata.photos.count) cleanup=\(prepared.metadata.mesh_cleanup)")
            Diagnostics.log("model size \(prepared.modelSize.summary) acceptable=\(prepared.modelSize.isAcceptable)")
            self.prepared = prepared
            let quality = ScanQuality(
                shotCount: shotCount,
                completedOrbit: completedOrbit,
                savedPhotoCount: prepared.metadata.photos.count,
                modelSize: prepared.modelSize
            )
            if let rejection = quality.rejection {
                Diagnostics.log("scan rejected, capture kept in \(folders.root.lastPathComponent): \(rejection)")
                stage = .rejected(rejection)
                return
            }
            if prepared.trackedPoseCount < prepared.metadata.photos.count {
                poseWarning = "Reconstruction solved camera positions for \(prepared.trackedPoseCount) of \(prepared.metadata.photos.count) key photos. Missing ones are stored as zeros."
            }
            try? FileManager.default.removeItem(at: folders.images)
            try? FileManager.default.removeItem(at: folders.checkpoint)
            stage = .review
        } catch {
            Diagnostics.log("processing failed: \(error.localizedDescription)")
            stage = .failed(error.localizedDescription)
        }
    }

    func cancelProcessing() {
        Diagnostics.log("processing cancel tapped")
        processingService.cancel()
    }

    // MARK: - Upload

    func upload() async {
        guard let prepared else { return }
        stage = .uploading
        errorMessage = nil
        Diagnostics.log("upload start")
        do {
            let receipt = try await UploadService().upload(prepared)
            self.receipt = receipt
            Diagnostics.log("upload done version=\(receipt.version)")
        } catch {
            Diagnostics.log("upload failed: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
            stage = .review
            return
        }
        if request.kind == .check {
            await runDiff()
        } else {
            stage = .saved
        }
    }

    /// Separate from upload so a failed comparison can be retried without
    /// uploading the scan again.
    func runDiff() async {
        guard let receipt else { return }
        diff = nil
        errorMessage = nil
        guard let baselineID = receipt.baselineID else {
            errorMessage = "No baseline scan exists for this item yet, so there is nothing to compare against."
            stage = .result
            return
        }
        stage = .comparing
        let started = Date()
        do {
            let result = try await EngineClients.make().diff(baseID: baselineID, newID: receipt.scanID)
            diff = result
            Diagnostics.log("diff done triage=\(result.triage.rawValue) regions=\(result.regions.count) mock=\(result.isMock) host=\(result.engineHost ?? "none") in \(String(format: "%.1f", Date().timeIntervalSince(started)))s")
        } catch {
            Diagnostics.log("diff failed: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
        }
        stage = .result
    }

    func decide(_ decision: String) async {
        guard let receipt else { return }
        isDeciding = true
        defer { isDeciding = false }
        do {
            try await UploadService().writeDecision(scanID: receipt.scanID, decision: decision)
            decisionMessage = decision == "accept" ? "Marked as accepted." : "Marked as disputed."
        } catch {
            decisionMessage = error.localizedDescription
        }
    }
}
