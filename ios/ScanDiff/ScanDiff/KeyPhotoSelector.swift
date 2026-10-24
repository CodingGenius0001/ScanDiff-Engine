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
        let buckets = bucketByAngle(candidates)
        var chosen: [KeyPhotoCandidate] = []
        var used = Set<URL>()
        for bucket in buckets where !bucket.isEmpty {
            let scored = ScanBundle.evenlySpaced(bucket, count: candidatesPerSector)
                .map { ($0, sharpness($0.url)) }
            if let best = scored.max(by: { $0.1 < $1.1 })?.0 {
                chosen.append(best)
                used.insert(best.url)
            }
        }
        if chosen.count < ScanQuality.minimumKeyPhotos {
            let leftovers = ScanBundle.evenlySpaced(
                candidates.filter { !used.contains($0.url) },
                count: (ScanQuality.minimumKeyPhotos - chosen.count) * 2
            )
            .map { ($0, sharpness($0.url)) }
            .sorted { $0.1 > $1.1 }
            .map(\.0)
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
        var sum = 0.0
        var sumSquares = 0.0
        var count = 0.0
        for y in 1..<(height - 1) {
            for x in 1..<(width - 1) {
                let center = Double(pixels[y * width + x]) * 4
                let neighbors = Double(pixels[y * width + x - 1])
                    + Double(pixels[y * width + x + 1])
                    + Double(pixels[(y - 1) * width + x])
                    + Double(pixels[(y + 1) * width + x])
                let laplacian = neighbors - center
                sum += laplacian
                sumSquares += laplacian * laplacian
                count += 1
            }
        }
        guard count > 0 else { return 0 }
        let mean = sum / count
        return sumSquares / count - mean * mean
    }
}
