import Foundation
import simd
import UIKit

enum ScanKind: String, CaseIterable, Identifiable, Codable {
    case baseline
    case check

    var id: String { rawValue }

    var title: String {
        switch self {
        case .baseline: "Baseline"
        case .check: "Check"
        }
    }

    /// Orbits walked before the scan finishes or offers the bottom pass.
    /// A baseline is the reference, so it gets a second, higher orbit; a check
    /// only has to cover what the diff compares.
    var plannedOrbits: Int {
        switch self {
        case .baseline: 2
        case .check: 1
        }
    }

    func orbitGuidance(_ orbit: Int) -> String {
        switch orbit {
        case 1: "Hold the phone a little above the object and look down slightly"
        case 2: "Raise the phone higher and look down at the top"
        default: "Go lower and look up at the sides"
        }
    }
}

struct ScanRequest: Equatable {
    var itemID: String
    var kind: ScanKind
}

struct CameraPose: Equatable {
    var transform: [Float]
    var intrinsics: [Float]

    init(transform matrix: simd_float4x4, intrinsics matrix3: simd_float3x3) {
        transform = Self.flatten(matrix)
        intrinsics = Self.flatten(matrix3)
    }

    init(transform: [Float], intrinsics: [Float]) {
        self.transform = transform
        self.intrinsics = intrinsics
    }

    var isTracked: Bool {
        transform.count == 16 && intrinsics.count == 9 && transform.contains { $0 != 0 }
    }

    static func flatten(_ matrix: simd_float4x4) -> [Float] {
        let columns = matrix.columns
        return [
            columns.0.x, columns.0.y, columns.0.z, columns.0.w,
            columns.1.x, columns.1.y, columns.1.z, columns.1.w,
            columns.2.x, columns.2.y, columns.2.z, columns.2.w,
            columns.3.x, columns.3.y, columns.3.z, columns.3.w
        ]
    }

    static func flatten(_ matrix: simd_float3x3) -> [Float] {
        let columns = matrix.columns
        return [
            columns.0.x, columns.0.y, columns.0.z,
            columns.1.x, columns.1.y, columns.1.z,
            columns.2.x, columns.2.y, columns.2.z
        ]
    }
}

struct PhotoRecord: Codable, Equatable {
    var file: String
    var camera_transform: [Float]
    var intrinsics: [Float]
    var image_width: Int
    var image_height: Int
}

struct FileRecord: Codable, Equatable {
    var name: String
    var sha256: String
}

/// Matches the engine's `TextureFile` schema.
struct TextureRecord: Codable, Equatable {
    var file: String
    var sha256: String
}

struct ScanMetadata: Codable, Equatable {
    var scan_id: String
    var item_id: String
    var kind: String
    var created_by: String
    var created_at: String
    var device: String
    var model_file: String
    var model_sha256: String
    var obj_file: String
    var material_file: String
    var textures: [TextureRecord]
    var mesh_cleanup: MeshCleanupSummary
    var files: [FileRecord]
    var photos: [PhotoRecord]
}

struct PreparedScan: Equatable {
    var directory: URL
    var metadata: ScanMetadata
    var modelURL: URL
    var trackedPoseCount: Int
}

struct ScanQuality: Equatable {
    var shotCount: Int
    var completedOrbit: Bool
    var savedPhotoCount: Int

    var rejection: String? {
        if shotCount < ScanQuality.minimumShots {
            return "This scan has \(shotCount) photos. Walk all the way around until at least \(ScanQuality.minimumShots) shots are taken, then re-scan."
        }
        if !completedOrbit {
            return "Coverage is too low. Complete at least one full loop around the object, then re-scan."
        }
        if savedPhotoCount > 0 && savedPhotoCount < ScanQuality.minimumKeyPhotos {
            return "Only \(savedPhotoCount) sharp frames were saved. Re-scan more slowly, in even light."
        }
        return nil
    }

    static let minimumShots = 20
    static let minimumKeyPhotos = 8
    static let targetKeyPhotos = 10
}

struct DiffRegion: Equatable, Identifiable {
    var id: String
    var label: String
    var score: Double?
}

struct DiffResult: Equatable {
    var heatmapURL: URL?
    var histogramBins: [Double]
    var regions: [DiffRegion]
    var verdict: String
    var confidence: Double
    var usedMock: Bool
}

struct UploadReceipt: Equatable {
    var scanID: UUID
    var modelURL: URL?
    var baselineID: UUID?
    var version: Int
}

enum ScanStage {
    case preflight
    case capture
    case processing
    case review
    case uploading
    case saved
    case result
    case rejected(String)
    case failed(String)
}

enum ScanError: LocalizedError {
    case unsupportedDevice
    case invalidItemID
    case folderCreationFailed
    case sessionFailed(String)
    case cancelled
    case missingModel
    case exportFailed(String)
    case unreadablePhoto(String)
    case missingSecrets
    case uploadFailed(String)
    case engineFailed(String)
    case decisionFailed(String)

    var errorDescription: String? {
        switch self {
        case .unsupportedDevice:
            "Guided capture needs an iPhone 12 Pro or later with LiDAR, running iOS 17 or later."
        case .invalidItemID:
            "Item id can use letters, numbers, dashes, and underscores."
        case .folderCreationFailed:
            "ScanDiff could not create a folder for this scan."
        case .sessionFailed(let message):
            message
        case .cancelled:
            "Processing was cancelled."
        case .missingModel:
            "Reconstruction finished without a model.usdz file."
        case .exportFailed(let message):
            "Could not export model.obj. \(message)"
        case .unreadablePhoto(let name):
            "Could not read captured photo \(name)."
        case .missingSecrets:
            "Add SUPABASE_URL and SUPABASE_ANON_KEY to Secrets.xcconfig, then rebuild."
        case .uploadFailed(let message):
            message
        case .engineFailed(let message):
            message
        case .decisionFailed(let message):
            message
        }
    }
}

enum ItemID {
    static func isValid(_ value: String) -> Bool {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        return !value.isEmpty && value.unicodeScalars.allSatisfy { allowed.contains($0) }
    }
}

enum Timestamps {
    static func iso8601UTC(_ date: Date = Date()) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
}

enum DeviceInfo {
    static var description: String {
        var system = utsname()
        uname(&system)
        let machine = withUnsafePointer(to: &system.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(cString: $0)
            }
        }
        return "\(machine), \(UIDevice.current.systemName) \(UIDevice.current.systemVersion)"
    }

    static var createdBy: String {
        UIDevice.current.name
    }
}
