import Foundation
import simd

struct RefineStats {
    var faces = 0
    var spikesRemoved = 0
    var maxShift: Float = 0
    var surfaceRoughness: Float = 0
    var shadingRoughness: Float = 0
}

struct RefineResult {
    /// New positions for spike vertices only, keyed by welded vertex id.
    var positions: [UInt32: SIMD3<Float>]
    /// Shading normals for every welded vertex in the mesh.
    var normals: [UInt32: SIMD3<Float>]
    var stats: RefineStats
}

/// Makes scans read as clean, well-defined shapes without moving the surface
/// the diff engine measures. At on-device mesh resolution a few-mm dent spans
/// only a few triangles, so any geometric smoothing also erodes real damage.
/// Instead this:
/// 1. pulls back isolated single-vertex spikes (the only positions it changes),
/// 2. bilateral-filters face normals (Zheng et al. 2011): each face averages
///    with neighbours that point the same way, so ripple flattens while creases
///    and edges stay sharp,
/// 3. writes those as shading normals, so viewers render the cleaned shape.
/// Cost is O(T·k) per iteration, k ≈ 12–20 neighbouring faces.
enum MeshRefiner {
    static let normalIterations = 3
    static let rangeSigma: Float = 0.35
    static let spikeFactor: Float = 2.5

    static func refine(triangles: [MeshCleaner.Triangle], welded: [UInt32], positions: [SIMD3<Float>]) -> RefineResult {
        var mesh = CompactMesh(triangles: triangles, welded: welded, positions: positions)
        guard mesh.faces.count >= 4 else {
            return RefineResult(positions: [:], normals: [:], stats: RefineStats())
        }
        var stats = RefineStats()
        stats.faces = mesh.faces.count
        let original = mesh.points

        stats.spikesRemoved = mesh.removeSpikes(factor: spikeFactor)
        var moved: [UInt32: SIMD3<Float>] = [:]
        for (index, point) in mesh.points.enumerated() where point != original[index] {
            moved[mesh.weldedIDs[index]] = point
            stats.maxShift = max(stats.maxShift, simd_distance(point, original[index]))
        }

        let raw = (0..<mesh.faces.count).map(mesh.faceNormal)
        let filtered = mesh.bilateralNormals(iterations: normalIterations, rangeSigma: rangeSigma)
        stats.surfaceRoughness = mesh.meanNeighbourAngle(raw)
        stats.shadingRoughness = mesh.meanNeighbourAngle(filtered)

        let vertexNormals = mesh.vertexNormals(from: filtered)
        var normals: [UInt32: SIMD3<Float>] = [:]
        normals.reserveCapacity(vertexNormals.count)
        for (index, normal) in vertexNormals.enumerated() {
            normals[mesh.weldedIDs[index]] = normal
        }
        return RefineResult(positions: moved, normals: normals, stats: stats)
    }
}

/// Welded, compact-index mesh with CSR adjacency for fast neighbourhood loops.
private struct CompactMesh {
    var points: [SIMD3<Float>]
    let weldedIDs: [UInt32]
    let faces: [SIMD3<Int32>]
    let vertexFaceOffsets: [Int32]
    let vertexFaces: [Int32]
    let vertexNeighbourOffsets: [Int32]
    let vertexNeighbours: [Int32]
    let faceNeighbourOffsets: [Int32]
    let faceNeighbours: [Int32]

    init(triangles: [MeshCleaner.Triangle], welded: [UInt32], positions: [SIMD3<Float>]) {
        var compact: [UInt32: Int32] = [:]
        var ids: [UInt32] = []
        var pts: [SIMD3<Float>] = []
        func index(_ raw: UInt32) -> Int32 {
            let id = welded[Int(raw)]
            if let existing = compact[id] { return existing }
            let next = Int32(ids.count)
            compact[id] = next
            ids.append(id)
            pts.append(positions[Int(id)])
            return next
        }
        let faceList = triangles.map { SIMD3(index($0.a), index($0.b), index($0.c)) }
        points = pts
        weldedIDs = ids
        faces = faceList
        let vertexCount = ids.count

        (vertexFaceOffsets, vertexFaces) = CompactMesh.csr(count: vertexCount, pairs: faceList.enumerated().flatMap { face, tri in
            [(tri.x, Int32(face)), (tri.y, Int32(face)), (tri.z, Int32(face))]
        })

        var neighbourPairs: [(Int32, Int32)] = []
        neighbourPairs.reserveCapacity(faceList.count * 6)
        for tri in faceList {
            for (u, v) in [(tri.x, tri.y), (tri.y, tri.z), (tri.z, tri.x)] {
                neighbourPairs.append((u, v))
                neighbourPairs.append((v, u))
            }
        }
        (vertexNeighbourOffsets, vertexNeighbours) = CompactMesh.csr(count: vertexCount, pairs: neighbourPairs, unique: true)

        var facePairs: [(Int32, Int32)] = []
        facePairs.reserveCapacity(faceList.count * 16)
        let vfo = vertexFaceOffsets, vf = vertexFaces
        for (face, tri) in faceList.enumerated() {
            for vertex in [tri.x, tri.y, tri.z] {
                for k in Int(vfo[Int(vertex)])..<Int(vfo[Int(vertex) + 1]) {
                    facePairs.append((Int32(face), vf[k]))
                }
            }
        }
        (faceNeighbourOffsets, faceNeighbours) = CompactMesh.csr(count: faceList.count, pairs: facePairs, unique: true)
    }

    /// Builds compressed sparse rows: offsets[i]..<offsets[i+1] index into values.
    private static func csr(count: Int, pairs: [(Int32, Int32)], unique: Bool = false) -> ([Int32], [Int32]) {
        var counts = [Int32](repeating: 0, count: count + 1)
        for (row, _) in pairs { counts[Int(row) + 1] += 1 }
        for i in 0..<count { counts[i + 1] += counts[i] }
        var fill = counts
        var values = [Int32](repeating: 0, count: pairs.count)
        for (row, value) in pairs {
            values[Int(fill[Int(row)])] = value
            fill[Int(row)] += 1
        }
        guard unique else { return (counts, values) }
        var offsets = [Int32](repeating: 0, count: count + 1)
        var deduped: [Int32] = []
        deduped.reserveCapacity(values.count / 2)
        for row in 0..<count {
            var seen = Set<Int32>()
            for value in values[Int(counts[row])..<Int(counts[row + 1])] where seen.insert(value).inserted {
                deduped.append(value)
            }
            offsets[row + 1] = Int32(deduped.count)
        }
        return (offsets, deduped)
    }

    func faceNormal(_ face: Int) -> SIMD3<Float> {
        let tri = faces[face]
        let n = simd_cross(points[Int(tri.y)] - points[Int(tri.x)], points[Int(tri.z)] - points[Int(tri.x)])
        let length = simd_length(n)
        return length > 0 ? n / length : .zero
    }

    func faceArea(_ face: Int) -> Float {
        let tri = faces[face]
        return 0.5 * simd_length(simd_cross(points[Int(tri.y)] - points[Int(tri.x)], points[Int(tri.z)] - points[Int(tri.x)]))
    }

    func centroid(_ face: Int) -> SIMD3<Float> {
        let tri = faces[face]
        return (points[Int(tri.x)] + points[Int(tri.y)] + points[Int(tri.z)]) / 3
    }

    /// Mean angle in degrees between neighbouring face normals: how rough the
    /// surface (raw normals) or its shading (filtered normals) looks.
    func meanNeighbourAngle(_ normals: [SIMD3<Float>]) -> Float {
        var total: Float = 0
        var count: Float = 0
        for face in 0..<faces.count {
            for k in Int(faceNeighbourOffsets[face])..<Int(faceNeighbourOffsets[face + 1]) {
                let other = Int(faceNeighbours[k])
                guard other > face else { continue }
                total += acos(max(-1, min(1, simd_dot(normals[face], normals[other]))))
                count += 1
            }
        }
        return count > 0 ? total / count * 180 / .pi : 0
    }

    /// Pulls back vertices that stick far out of their one-ring, relative to
    /// the local edge length. Real corners and dents sit close to their ring's
    /// average; single-vertex reconstruction spikes do not.
    mutating func removeSpikes(factor: Float) -> Int {
        var removed = 0
        let snapshot = points
        for vertex in 0..<points.count {
            let range = Int(vertexNeighbourOffsets[vertex])..<Int(vertexNeighbourOffsets[vertex + 1])
            guard range.count >= 3 else { continue }
            var centroid = SIMD3<Float>.zero
            var edge: Float = 0
            for k in range {
                let neighbour = snapshot[Int(vertexNeighbours[k])]
                centroid += neighbour
                edge += simd_distance(neighbour, snapshot[vertex])
            }
            centroid /= Float(range.count)
            edge /= Float(range.count)
            if edge > 0, simd_distance(snapshot[vertex], centroid) > factor * edge {
                points[vertex] = centroid
                removed += 1
            }
        }
        return removed
    }

    func bilateralNormals(iterations: Int, rangeSigma: Float) -> [SIMD3<Float>] {
        var normals = (0..<faces.count).map(faceNormal)
        let areas = (0..<faces.count).map(faceArea)
        let centroids = (0..<faces.count).map(centroid)

        var spacing: Float = 0
        var pairs: Float = 0
        for face in 0..<faces.count {
            for k in Int(faceNeighbourOffsets[face])..<Int(faceNeighbourOffsets[face + 1]) where Int(faceNeighbours[k]) != face {
                spacing += simd_distance(centroids[face], centroids[Int(faceNeighbours[k])])
                pairs += 1
            }
        }
        let spatialSigma = pairs > 0 ? spacing / pairs : 1
        let spatialDenominator = 2 * spatialSigma * spatialSigma
        let rangeDenominator = 2 * rangeSigma * rangeSigma

        for _ in 0..<iterations {
            var next = normals
            for face in 0..<faces.count {
                var sum = SIMD3<Float>.zero
                for k in Int(faceNeighbourOffsets[face])..<Int(faceNeighbourOffsets[face + 1]) {
                    let other = Int(faceNeighbours[k])
                    let spatial = simd_length_squared(centroids[face] - centroids[other])
                    let range = simd_length_squared(normals[face] - normals[other])
                    sum += areas[other] * exp(-spatial / spatialDenominator) * exp(-range / rangeDenominator) * normals[other]
                }
                let length = simd_length(sum)
                if length > 0 { next[face] = sum / length }
            }
            normals = next
        }
        return normals
    }

    func vertexNormals(from faceNormals: [SIMD3<Float>]) -> [SIMD3<Float>] {
        (0..<points.count).map { vertex in
            var sum = SIMD3<Float>.zero
            for k in Int(vertexFaceOffsets[vertex])..<Int(vertexFaceOffsets[vertex + 1]) {
                let face = Int(vertexFaces[k])
                sum += faceArea(face) * faceNormals[face]
            }
            let length = simd_length(sum)
            return length > 0 ? sum / length : SIMD3(0, 1, 0)
        }
    }
}
