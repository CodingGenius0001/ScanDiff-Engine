import CryptoKit
import Foundation
import ImageIO
import ModelIO
import RealityKit
import UniformTypeIdentifiers

struct CaptureFolders {
    let root: URL
    let images: URL
    let checkpoint: URL
    let bundle: URL

    static func make(scanID: UUID) throws -> CaptureFolders {
        let root = URL.documentsDirectory
            .appendingPathComponent("Captures", isDirectory: true)
            .appendingPathComponent(scanID.uuidString, isDirectory: true)
        let images = root.appendingPathComponent("Images", isDirectory: true)
        let checkpoint = root.appendingPathComponent("Checkpoint", isDirectory: true)
        let bundle = root.appendingPathComponent("Bundle", isDirectory: true)
        for folder in [images, checkpoint, bundle] {
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            } catch {
                throw ScanError.folderCreationFailed
            }
        }
        return CaptureFolders(root: root, images: images, checkpoint: checkpoint, bundle: bundle)
    }
}

enum ScanBundle {
    static let modelFileName = "model.usdz"
    static let objFileName = "model.obj"

    static func make(
        scanID: UUID,
        request: ScanRequest,
        imagesDirectory: URL,
        modelUSDZ: URL,
        bundleDirectory: URL,
        poses: PhotogrammetrySession.Poses?,
        createdAt: Date = Date()
    ) throws -> PreparedScan {
        guard FileManager.default.fileExists(atPath: modelUSDZ.path) else {
            throw ScanError.missingModel
        }
        let destinationModel = bundleDirectory.appendingPathComponent(modelFileName)
        if modelUSDZ.standardizedFileURL != destinationModel.standardizedFileURL {
            if FileManager.default.fileExists(atPath: destinationModel.path) {
                try FileManager.default.removeItem(at: destinationModel)
            }
            try FileManager.default.copyItem(at: modelUSDZ, to: destinationModel)
        }

        try exportOBJ(from: destinationModel, to: bundleDirectory)

        let candidates = KeyPhotoSelector.candidates(
            poses: poses,
            fallbackImages: try imageFiles(in: imagesDirectory)
        )
        let chosen = KeyPhotoSelector.select(from: candidates)
        let photos = try writeKeyPhotos(chosen, to: bundleDirectory)

        let digest = try sha256Hex(of: destinationModel)
        let metadata = ScanMetadata(
            scan_id: scanID.uuidString,
            item_id: request.itemID,
            kind: request.kind.rawValue,
            created_by: DeviceInfo.createdBy,
            created_at: Timestamps.iso8601UTC(createdAt),
            device: DeviceInfo.description,
            model_file: modelFileName,
            model_sha256: digest,
            photos: photos
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(metadata).write(
            to: bundleDirectory.appendingPathComponent("metadata.json"),
            options: .atomic
        )
        let tracked = photos.filter { $0.camera_transform.contains { $0 != 0 } }.count
        return PreparedScan(
            directory: bundleDirectory,
            metadata: metadata,
            modelURL: destinationModel,
            trackedPoseCount: tracked
        )
    }

    static func imageFiles(in directory: URL) throws -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey]
        ) else {
            return []
        }
        var files: [URL] = []
        for case let url as URL in enumerator {
            let values = try url.resourceValues(forKeys: [.isRegularFileKey])
            guard values.isRegularFile == true else { continue }
            guard ["jpg", "jpeg", "heic", "png"].contains(url.pathExtension.lowercased()) else { continue }
            files.append(url)
        }
        return files.sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    static func evenlySpaced<T>(_ items: [T], count: Int) -> [T] {
        guard !items.isEmpty, count > 0 else { return [] }
        let target = min(count, items.count)
        guard target > 1 else { return [items[items.count / 2]] }
        return (0..<target).map { index in
            let position = Double(index) * Double(items.count - 1) / Double(target - 1)
            return items[Int(position.rounded())]
        }
    }

    /// Writes raw sensor pixels without an orientation tag so the stored
    /// pixel grid matches the camera intrinsics.
    private static func writeKeyPhotos(_ chosen: [KeyPhotoCandidate], to directory: URL) throws -> [PhotoRecord] {
        var records: [PhotoRecord] = []
        for (offset, candidate) in chosen.enumerated() {
            let fileName = String(format: "photo_%02d.jpg", offset + 1)
            let destinationURL = directory.appendingPathComponent(fileName)
            guard let source = CGImageSourceCreateWithURL(candidate.url as CFURL, nil),
                  let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
                  let destination = CGImageDestinationCreateWithURL(
                    destinationURL as CFURL,
                    UTType.jpeg.identifier as CFString,
                    1,
                    nil
                  ) else {
                throw ScanError.unreadablePhoto(candidate.url.lastPathComponent)
            }
            let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 0.9]
            CGImageDestinationAddImage(destination, image, options as CFDictionary)
            guard CGImageDestinationFinalize(destination) else {
                throw ScanError.unreadablePhoto(candidate.url.lastPathComponent)
            }
            let intrinsics = candidate.pose?.intrinsics
                ?? KeyPhotoSelector.exifIntrinsics(candidate.url)
                ?? Array(repeating: 0, count: 9)
            records.append(
                PhotoRecord(
                    file: fileName,
                    camera_transform: candidate.pose?.transform ?? Array(repeating: 0, count: 16),
                    intrinsics: intrinsics
                )
            )
        }
        return records
    }

    /// Exports model.obj and writes each embedded texture as a PNG beside it,
    /// so model.mtl points at files that exist in the bundle.
    private static func exportOBJ(from usdz: URL, to directory: URL) throws {
        guard MDLAsset.canExportFileExtension("obj") else {
            throw ScanError.exportFailed("This device cannot export OBJ.")
        }
        let asset = MDLAsset(url: usdz)
        asset.loadTextures()
        var textureIndex = 0
        for mesh in meshes(in: asset) {
            for case let submesh as MDLSubmesh in mesh.submeshes ?? [] {
                guard let material = submesh.material else { continue }
                for index in 0..<material.count {
                    guard let property = material[index], property.type == .texture,
                          let texture = property.textureSamplerValue?.texture,
                          let image = texture.imageFromTexture()?.takeUnretainedValue() else {
                        continue
                    }
                    let name = "texture_\(textureIndex).png"
                    textureIndex += 1
                    try writePNG(image, to: directory.appendingPathComponent(name))
                    property.type = .URL
                    property.urlValue = URL(fileURLWithPath: name)
                }
            }
        }
        do {
            try asset.export(to: directory.appendingPathComponent(objFileName))
        } catch {
            throw ScanError.exportFailed(error.localizedDescription)
        }
    }

    private static func meshes(in asset: MDLAsset) -> [MDLMesh] {
        var result: [MDLMesh] = []
        func visit(_ object: MDLObject) {
            if let mesh = object as? MDLMesh {
                result.append(mesh)
            }
            for child in object.children.objects {
                visit(child)
            }
        }
        for index in 0..<asset.count {
            if let object = asset.object(at: index) as MDLObject? {
                visit(object)
            }
        }
        return result
    }

    private static func writePNG(_ image: CGImage, to url: URL) throws {
        guard let destination = CGImageDestinationCreateWithURL(
            url as CFURL,
            UTType.png.identifier as CFString,
            1,
            nil
        ) else {
            throw ScanError.exportFailed("Could not create \(url.lastPathComponent).")
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else {
            throw ScanError.exportFailed("Could not write \(url.lastPathComponent).")
        }
    }

    static func sha256Hex(of url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 1024 * 1024), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
