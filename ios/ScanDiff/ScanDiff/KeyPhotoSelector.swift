import Accelerate
import CoreGraphics
import Foundation
import ImageIO
import RealityKit
import simd

struct KeyPhotoCandidate {
    let url: URL
    let pose: CameraPose?
    let position: SIMD3<Float>?
}

enum KeyPhotoSelector {
    static let sectors = 10
    private static let candidatesPerSector = 4

    static func candidates(poses: PhotogrammetrySession.Poses?, fallbackImages: [URL]) -> [KeyPhotoCandidate] {
        guard let poses else {
            return fallbackImages.map { KeyPhotoCandidate(url: $0, pose: nil, position: nil) }
        }
        let urls = poses.urlsBySample
        let solved: [KeyPhotoCandidate] = poses.posesBySample.keys.sorted().compactMap { id in
            guard let pose = poses.posesBySample[id], let url = urls[id] else { return nil }
            let matrix = pose.transform.matrix
            return KeyPhotoCandidate(
                url: url,
                pose: CameraPose(transform: CameraPose.flatten(matrix), intrinsics: intrinsics(for: pose, url: url)),
                position: SIMD3(matrix.columns.3.x, matrix.columns.3.y, matrix.columns.3.z)
            )
        }
        return solved.isEmpty
            ? fallbackImages.map { KeyPhotoCandidate(url: $0, pose: nil, position: nil) }
            : solved
    }

    /// Picks the sharpest frame in each slice of a circle around the object,
    /// then tops up with the sharpest leftovers until there are enough photos.
    static func select(from candidates: [KeyPhotoCandidate]) -> [KeyPhotoCandidate] {
        guard !candidates.isEmpty else { return [] }
        let samples = bucketByAngle(candidates)
            .filter { !$0.isEmpty }
            .map { ScanBundle.evenlySpaced($0, count: candidatesPerSector) }
        let sampleScores = scores(for: samples.flatMap { $0 }.map(\.url))
        var chosen: [KeyPhotoCandidate] = []
        var used = Set<URL>()
        var offset = 0
        for sample in samples {
            let range = offset..<(offset + sample.count)
            offset += sample.count
            if let best = range.max(by: { sampleScores[$0] < sampleScores[$1] }) {
                let candidate = sample[best - range.lowerBound]
                chosen.append(candidate)
                used.insert(candidate.url)
            }
        }
        if chosen.count < ScanQuality.minimumKeyPhotos {
            let pool = ScanBundle.evenlySpaced(
                candidates.filter { !used.contains($0.url) },
                count: (ScanQuality.minimumKeyPhotos - chosen.count) * 2
            )
            let poolScores = scores(for: pool.map(\.url))
            let leftovers = pool.indices
                .sorted { poolScores[$0] > poolScores[$1] }
                .map { pool[$0] }
            for candidate in leftovers where chosen.count < ScanQuality.minimumKeyPhotos {
                chosen.append(candidate)
                used.insert(candidate.url)
            }
        }
        return chosen
    }

    private static func bucketByAngle(_ candidates: [KeyPhotoCandidate]) -> [[KeyPhotoCandidate]] {
        let positions = candidates.compactMap(\.position)
        guard positions.count == candidates.count, !positions.isEmpty else {
            let size = max(1, Int((Double(candidates.count) / Double(sectors)).rounded(.up)))
            return stride(from: 0, to: candidates.count, by: size).map {
                Array(candidates[$0..<min($0 + size, candidates.count)])
            }
        }
        let center = positions.reduce(SIMD3<Float>.zero, +) / Float(positions.count)
        var buckets = Array(repeating: [KeyPhotoCandidate](), count: sectors)
        for candidate in candidates {
            guard let position = candidate.position else { continue }
            let angle = atan2(position.z - center.z, position.x - center.x)
            let normalized = (angle + .pi) / (2 * .pi)
            let index = min(sectors - 1, max(0, Int(normalized * Float(sectors))))
            buckets[index].append(candidate)
        }
        return buckets
    }

    private static func intrinsics(for pose: PhotogrammetrySession.Pose, url: URL) -> [Float] {
        if #available(iOS 26.0, *), let solved = pose.intrinsics {
            return CameraPose.flatten(solved)
        }
        return exifIntrinsics(url) ?? Array(repeating: 0, count: 9)
    }

    /// Approximates a pinhole camera from the 35mm-equivalent focal length.
    static func exifIntrinsics(_ url: URL) -> [Float]? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any],
              let focal35 = exif[kCGImagePropertyExifFocalLenIn35mmFilm] as? Double,
              focal35 > 0 else {
            return nil
        }
        let focalPixels = Float(focal35 / 36.0 * Double(max(width, height)))
        let cx = Float(width) / 2
        let cy = Float(height) / 2
        return [focalPixels, 0, 0, 0, focalPixels, 0, cx, cy, 1]
    }

    /// Variance of a Laplacian on a small grayscale thumbnail. Higher is sharper.
    static func sharpness(_ url: URL) -> Double {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return 0 }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: 320
        ]
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return 0
        }
        let width = thumbnail.width
        let height = thumbnail.height
        guard width > 2, height > 2 else { return 0 }
        var pixels = [UInt8](repeating: 0, count: width * height)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(
                data: buffer.baseAddress,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: width,
                space: CGColorSpaceCreateDeviceGray(),
                bitmapInfo: CGImageAlphaInfo.none.rawValue
            ) else {
                return false
            }
            context.draw(thumbnail, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard drawn else { return 0 }

        var luminance = [Float](repeating: 0, count: pixels.count)
        vDSP.convertElements(of: pixels, to: &luminance)
        var laplacian = [Float](repeating: 0, count: pixels.count)
        let kernel: [Float] = [0, 1, 0, 1, -4, 1, 0, 1, 0]
        let rowBytes = width * MemoryLayout<Float>.stride
        let status = luminance.withUnsafeMutableBufferPointer { input in
            laplacian.withUnsafeMutableBufferPointer { output in
                var source = vImage_Buffer(
                    data: input.baseAddress,
                    height: vImagePixelCount(height),
                    width: vImagePixelCount(width),
                    rowBytes: rowBytes
                )
                var destination = vImage_Buffer(
                    data: output.baseAddress,
                    height: vImagePixelCount(height),
                    width: vImagePixelCount(width),
                    rowBytes: rowBytes
                )
                return vImageConvolve_PlanarF(&source, &destination, nil, 0, 0, kernel, 3, 3, 0, vImage_Flags(kvImageEdgeExtend))
            }
        }
        guard status == kvImageNoError else { return 0 }
        let mean = vDSP.mean(laplacian)
        let meanSquare = vDSP.meanSquare(laplacian)
        return Double(meanSquare - mean * mean)
    }

    /// Scores every URL concurrently. Each score is independent.
    static func scores(for urls: [URL]) -> [Double] {
        var result = [Double](repeating: 0, count: urls.count)
        result.withUnsafeMutableBufferPointer { buffer in
            guard let base = buffer.baseAddress else { return }
            DispatchQueue.concurrentPerform(iterations: urls.count) { index in
                base[index] = sharpness(urls[index])
            }
        }
        return result
    }
}
