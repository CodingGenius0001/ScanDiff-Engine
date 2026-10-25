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
    static let materialFileName = "model.mtl"
    static let metadataFileName = "metadata.json"

    struct Input {
        let scanID: UUID
        let request: ScanRequest
        let imagesDirectory: URL
        let modelUSDZ: URL
        let bundleDirectory: URL
        let createdBy: String
        let device: String
        let iosVersion: String
        let imageCount: Int
        var createdAt = Date()
    }

    /// Blocking. Call off the main thread.
    static func make(_ input: Input, poses: PhotogrammetrySession.Poses?) throws -> PreparedScan {
        let bundleDirectory = input.bundleDirectory
        guard FileManager.default.fileExists(atPath: input.modelUSDZ.path) else {
            throw ScanError.missingModel
        }
        let destinationModel = bundleDirectory.appendingPathComponent(modelFileName)
        if input.modelUSDZ.standardizedFileURL != destinationModel.standardizedFileURL {
            if FileManager.default.fileExists(atPath: destinationModel.path) {
                try FileManager.default.removeItem(at: destinationModel)
            }
            try FileManager.default.copyItem(at: input.modelUSDZ, to: destinationModel)
        }

        let (cleanup, modelSize) = try exportOBJ(from: destinationModel, to: bundleDirectory)
        let materialURL = bundleDirectory.appendingPathComponent(materialFileName)
        let textures = FileManager.default.fileExists(atPath: materialURL.path)
            ? try MaterialFile.normalize(at: materialURL)
            : []

        let candidates = KeyPhotoSelector.candidates(
            poses: poses,
            fallbackImages: try imageFiles(in: input.imagesDirectory)
        )
        let chosen = KeyPhotoSelector.select(from: candidates)
        let photos = try writeKeyPhotos(chosen, to: bundleDirectory)

        let bundleFiles = try FileManager.default
            .contentsOfDirectory(at: bundleDirectory, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent != metadataFileName }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        let digests = try Hashing.sha256Hex(of: bundleFiles)
        let files = zip(bundleFiles, digests).map { FileRecord(name: $0.lastPathComponent, sha256: $1) }
        guard let modelDigest = files.first(where: { $0.name == modelFileName })?.sha256 else {
            throw ScanError.missingModel
        }

        let metadata = ScanMetadata(
            scan_id: input.scanID.uuidString,
            item_id: input.request.itemID,
            kind: input.request.kind.rawValue,
            created_by: input.createdBy,
            created_at: Timestamps.iso8601UTC(input.createdAt),
            device: input.device,
            ios_version: input.iosVersion,
            image_count: input.imageCount,
            model_file: modelFileName,
            model_sha256: modelDigest,
            obj_file: objFileName,
            material_file: materialFileName,
            textures: textures.compactMap { name in
                files.first { $0.name == name }.map { TextureRecord(file: name, sha256: $0.sha256) }
            },
            mesh_cleanup: cleanup,
            files: files,
            photos: photos
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(metadata).write(
            to: bundleDirectory.appendingPathComponent(metadataFileName),
            options: .atomic
        )
        let tracked = photos.filter { $0.camera_transform.contains { $0 != 0 } }.count
        return PreparedScan(
            directory: bundleDirectory,
            metadata: metadata,
            modelURL: destinationModel,
            trackedPoseCount: tracked,
            modelSize: modelSize
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
    /// Photos are independent, so they decode and encode in parallel.
    private static func writeKeyPhotos(_ chosen: [KeyPhotoCandidate], to directory: URL) throws -> [PhotoRecord] {
        var results = [Result<PhotoRecord, ScanError>?](repeating: nil, count: chosen.count)
        results.withUnsafeMutableBufferPointer { buffer in
            guard let base = buffer.baseAddress else { return }
            DispatchQueue.concurrentPerform(iterations: chosen.count) { index in
                base[index] = writeKeyPhoto(chosen[index], number: index + 1, to: directory)
            }
        }
        return try results.map { result in
            guard let result else { throw ScanError.unreadablePhoto("key photo") }
            return try result.get()
        }
    }

    private static func writeKeyPhoto(_ candidate: KeyPhotoCandidate, number: Int, to directory: URL) -> Result<PhotoRecord, ScanError> {
        let fileName = String(format: "photo_%02d.jpg", number)
        let destinationURL = directory.appendingPathComponent(fileName)
        guard let source = CGImageSourceCreateWithURL(candidate.url as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              let destination = CGImageDestinationCreateWithURL(
                destinationURL as CFURL,
                UTType.jpeg.identifier as CFString,
                1,
                nil
              ) else {
            return .failure(.unreadablePhoto(candidate.url.lastPathComponent))
        }
        let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 0.9]
        CGImageDestinationAddImage(destination, image, options as CFDictionary)
        guard CGImageDestinationFinalize(destination) else {
            return .failure(.unreadablePhoto(candidate.url.lastPathComponent))
        }
        let intrinsics = candidate.pose?.intrinsics
            ?? KeyPhotoSelector.exifIntrinsics(candidate.url)
            ?? Array(repeating: 0, count: 9)
        return .success(
            PhotoRecord(
                file: fileName,
                camera_transform: candidate.pose?.transform ?? Array(repeating: 0, count: 16),
                intrinsics: intrinsics,
                image_width: image.width,
                image_height: image.height
            )
        )
    }

    /// Cleans the mesh, then exports model.obj and writes each embedded
    /// texture as a PNG beside it so model.mtl points at files in the bundle.
    /// model.usdz is left exactly as reconstruction produced it.
    private static func exportOBJ(from usdz: URL, to directory: URL) throws -> (MeshCleanupSummary, ModelSize) {
        guard MDLAsset.canExportFileExtension("obj") else {
            throw ScanError.exportFailed("This device cannot export OBJ.")
        }
        let asset = MDLAsset(url: usdz)
        asset.loadTextures()
        let assetMeshes = meshes(in: asset)
        let cleanup = MeshCleaner.clean(assetMeshes)
        let modelSize = MeshCleaner.measure(assetMeshes)
        var textureIndex = 0
        for mesh in assetMeshes {
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
        return (cleanup, modelSize)
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
}
