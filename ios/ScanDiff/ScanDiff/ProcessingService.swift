import Foundation
import RealityKit

@MainActor
final class ProcessingService {
    private var session: PhotogrammetrySession?

    func cancel() {
        session?.cancel()
    }

    /// Builds model.usdz at reduced detail and returns the per-image camera poses
    /// that reconstruction solved, in the same coordinate frame as the model.
    func process(
        imagesDirectory: URL,
        checkpointDirectory: URL,
        outputURL: URL,
        onProgress: @escaping (Double) -> Void
    ) async throws -> PhotogrammetrySession.Poses? {
        var configuration = PhotogrammetrySession.Configuration()
        configuration.checkpointDirectory = checkpointDirectory
        let session: PhotogrammetrySession
        do {
            session = try PhotogrammetrySession(input: imagesDirectory, configuration: configuration)
        } catch {
            throw ScanError.sessionFailed(error.localizedDescription)
        }
        self.session = session
        defer { self.session = nil }

        if FileManager.default.fileExists(atPath: outputURL.path) {
            try FileManager.default.removeItem(at: outputURL)
        }
        try session.process(requests: [
            .modelFile(url: outputURL, detail: .reduced),
            .poses
        ])

        var poses: PhotogrammetrySession.Poses?
        var modelError: Error?

        for try await output in session.outputs {
            switch output {
            case .requestProgress(let request, fractionComplete: let fraction):
                guard case .modelFile = request else { continue }
                onProgress(fraction)
            case .requestComplete(_, let result):
                if case .poses(let solved) = result {
                    poses = solved
                }
            case .requestError(let request, let error):
                if case .modelFile = request {
                    modelError = error
                }
            case .processingCancelled:
                throw ScanError.cancelled
            case .processingComplete:
                if let modelError {
                    throw ScanError.sessionFailed(modelError.localizedDescription)
                }
                guard FileManager.default.fileExists(atPath: outputURL.path) else {
                    throw ScanError.missingModel
                }
                return poses
            case .inputComplete,
                 .invalidSample,
                 .skippedSample,
                 .automaticDownsampling,
                 .requestProgressInfo,
                 .stitchingIncomplete:
                continue
            @unknown default:
                continue
            }
        }
        throw ScanError.missingModel
    }
}
