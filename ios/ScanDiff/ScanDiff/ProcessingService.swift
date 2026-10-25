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
    /// `highSensitivity` finds more features on plain, dark or shiny objects at
    /// the cost of time; it is the retry when the normal pass can't solve the object.
    func process(
        imagesDirectory: URL,
        checkpointDirectory: URL,
        outputURL: URL,
        highSensitivity: Bool = false,
        onProgress: @escaping (Double) -> Void
    ) async throws -> PhotogrammetrySession.Poses? {
        var configuration = PhotogrammetrySession.Configuration()
        configuration.checkpointDirectory = checkpointDirectory
        // Object Capture takes photos in order around the object, so matching
        // neighbours first is faster than treating them as unordered.
        configuration.sampleOrdering = .sequential
        if highSensitivity {
            configuration.featureSensitivity = .high
        }
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
                    throw ScanError.reconstructionFailed(modelError.localizedDescription)
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
