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

    var stage: ScanStage = .capture
    var session: ObjectCaptureSession?
    var shotCount = 0
    var completedOrbit = false
    var progress = 0.0
    var statusMessage = "Reconstructing the model…"
    var prepared: PreparedScan?
    var receipt: UploadReceipt?
    var diff: DiffResult?
    var poseWarning: String?
    var errorMessage: String?
    var decisionMessage: String?
    var isDeciding = false

    var coverage: Double {
        let shots = min(Double(shotCount) / Double(ScanQuality.minimumShots), 1)
        let orbit = completedOrbit ? 1.0 : 0
        return min(1, (shots * 0.7) + (orbit * 0.3))
    }

    init(request: ScanRequest) throws {
        self.request = request
        self.scanID = UUID()
        self.folders = try CaptureFolders.make(scanID: scanID)
    }

    func prepareCapture() {
        guard session == nil else { return }
        guard case .capture = stage else { return }
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
    }

    func noteShot(_ count: Int) {
        guard count != shotCount else { return }
        shotCount = count
    }

    func markOrbitComplete() {
        completedOrbit = true
    }

    func syncCaptureSession() {
        guard let session else { return }
        noteShot(session.numberOfShotsTaken)
        if session.userCompletedScanPass {
            markOrbitComplete()
        }
        if case .completed = session.state {
            finishCaptureIfNeeded()
        } else if case .failed(let error) = session.state {
            fail(error.localizedDescription)
        }
    }

    func finishCaptureIfNeeded() {
        guard case .capture = stage else { return }
        session = nil
        UIApplication.shared.isIdleTimerDisabled = false
        let quality = ScanQuality(shotCount: shotCount, completedOrbit: completedOrbit, savedPhotoCount: 0)
        if let rejection = quality.rejection {
            stage = .rejected(rejection)
        } else {
            stage = .processing
        }
    }

    func fail(_ message: String) {
        guard case .capture = stage else { return }
        session = nil
        UIApplication.shared.isIdleTimerDisabled = false
        stage = .failed(message)
    }

    func cancelCapture() {
        session?.cancel()
        session = nil
        UIApplication.shared.isIdleTimerDisabled = false
    }

    func runProcessing() async {
        guard !didStartProcessing else { return }
        didStartProcessing = true
        UIApplication.shared.isIdleTimerDisabled = true
        defer { UIApplication.shared.isIdleTimerDisabled = false }
        let output = folders.bundle.appendingPathComponent(ScanBundle.modelFileName)
        do {
            let poses = try await processingService.process(
                imagesDirectory: folders.images,
                checkpointDirectory: folders.checkpoint,
                outputURL: output,
                onProgress: { [weak self] fraction in
                    self?.progress = fraction
                    let percent = Int((fraction * 100).rounded())
                    self?.statusMessage = "Reconstructing the model… \(percent)%"
                }
            )
            let prepared = try ScanBundle.make(
                scanID: scanID,
                request: request,
                imagesDirectory: folders.images,
                modelUSDZ: output,
                bundleDirectory: folders.bundle,
                poses: poses
            )
            self.prepared = prepared
            let quality = ScanQuality(
                shotCount: shotCount,
                completedOrbit: completedOrbit,
                savedPhotoCount: prepared.metadata.photos.count
            )
            if let rejection = quality.rejection {
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
            stage = .failed(error.localizedDescription)
        }
    }

    func cancelProcessing() {
        processingService.cancel()
    }

    func upload() async {
        guard let prepared else { return }
        stage = .uploading
        errorMessage = nil
        do {
            let receipt = try await UploadService().upload(prepared)
            self.receipt = receipt
            if request.kind == .check {
                if let baselineID = receipt.baselineID {
                    diff = try await EngineClients.make().diff(baseID: baselineID, newID: receipt.scanID)
                } else {
                    errorMessage = "No baseline scan exists for this item yet."
                }
                stage = .result
            } else {
                stage = .saved
            }
        } catch {
            errorMessage = error.localizedDescription
            stage = .review
        }
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
