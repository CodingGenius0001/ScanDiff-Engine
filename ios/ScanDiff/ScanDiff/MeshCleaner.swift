import Foundation
import ModelIO
import simd

struct MeshCleanupSummary: Codable, Equatable {
    var removed_components = 0
    var removed_triangles = 0
    var smoothed_boundary_vertices = 0
    var spikes_removed = 0
    /// Largest vertex move made by spike removal. Nothing else moves vertices.
    var max_shift_mm: Float = 0
    /// Mean angle between neighbouring faces of the geometry, unchanged by refinement.
    var surface_roughness_deg: Float = 0
    /// The same measure for the filtered shading normals written to model.obj.
    var shading_roughness_deg: Float = 0
    var faces = 0

    mutating func add(_ other: MeshCleanupSummary) {
        let total = faces + other.faces
        func blend(_ a: Float, _ b: Float) -> Float {
            total > 0 ? (a * Float(faces) + b * Float(other.faces)) / Float(total) : 0
        }
        surface_roughness_deg = blend(surface_roughness_deg, other.surface_roughness_deg)
        shading_roughness_deg = blend(shading_roughness_deg, other.shading_roughness_deg)
        removed_components += other.removed_components
        removed_triangles += other.removed_triangles
        smoothed_boundary_vertices += other.smoothed_boundary_vertices
        spikes_removed += other.spikes_removed
        max_shift_mm = max(max_shift_mm, other.max_shift_mm)
        faces = total
    }
}

/// Cleans reconstruction artifacts while keeping real damage (dents, chips,
/// scratches) for the diff engine:
/// - drops degenerate triangles,
/// - drops floating fragments much smaller than the main object,
/// - removes single-vertex spikes and writes edge-preserving shading normals
///   (see MeshRefiner); no other vertex moves,
/// - Taubin-smooths only open boundary loops (ragged cut edges),
/// - compacts away vertices nothing references.
/// Topology is computed on position-welded vertices so UV seams, where
/// vertices are duplicated, are not mistaken for holes or separate parts.
/// Runs in O(V + T) with hashing.
enum MeshCleaner {
    static let weldTolerance: Float = 1e-5
    static let minimumComponentShare = 0.05
    static let boundaryIterations = 3

    static func clean(_ meshes: [MDLMesh]) -> MeshCleanupSummary {
        var total = MeshCleanupSummary()
        for mesh in meshes {
            total.add(clean(mesh))
        }
        return total
    }

    static func clean(_ mesh: MDLMesh) -> MeshCleanupSummary {
        guard let layout = PositionLayout(mesh: mesh),
              let submeshes = mesh.submeshes as? [MDLSubmesh],
              !submeshes.isEmpty,
              submeshes.allSatisfy({ $0.geometryType == .triangles }) else {
            return MeshCleanupSummary()
        }
        let positions = layout.readPositions(mesh: mesh)
        let welded = weld(positions)
        let triangles = readTriangles(submeshes)

        var summary = MeshCleanupSummary()
        let nondegenerate = triangles.filter { !isDegenerate($0, welded: welded, positions: positions) }
        summary.removed_triangles += triangles.count - nondegenerate.count

        let (kept, droppedComponents) = keepMainComponents(nondegenerate, welded: welded)
        summary.removed_components = droppedComponents
        summary.removed_triangles += nondegenerate.count - kept.count

        let refined = MeshRefiner.refine(triangles: kept, welded: welded, positions: positions)
        summary.faces = refined.stats.faces
        summary.spikes_removed = refined.stats.spikesRemoved
        summary.max_shift_mm = refined.stats.maxShift * 1000
        summary.surface_roughness_deg = refined.stats.surfaceRoughness
        summary.shading_roughness_deg = refined.stats.shadingRoughness

        var working = positions
        for (id, point) in refined.positions {
            working[Int(id)] = point
        }
        let smoothedBoundary = smoothBoundaries(kept, welded: welded, positions: working)
        summary.smoothed_boundary_vertices = smoothedBoundary.count
        let finalPositions = refined.positions.merging(smoothedBoundary) { _, boundary in boundary }

        guard summary.removed_triangles > 0 || !finalPositions.isEmpty || !refined.normals.isEmpty else {
            return summary
        }
        rebuild(
            mesh: mesh,
            layout: layout,
            submeshes: submeshes,
            triangles: kept,
            welded: welded,
            smoothed: finalPositions,
            normals: refined.normals
        )
        return summary
    }

    // MARK: - Topology

    struct Triangle {
        let submesh: Int
        let a: UInt32
        let b: UInt32
        let c: UInt32
    }

    private struct WeldKey: Hashable {
        let x: Int32
        let y: Int32
        let z: Int32
    }

    /// Maps every raw vertex to the first raw vertex at the same position.
    private static func weld(_ positions: [SIMD3<Float>]) -> [UInt32] {
        var canonical: [WeldKey: UInt32] = [:]
        canonical.reserveCapacity(positions.count)
        var result = [UInt32](repeating: 0, count: positions.count)
        for (index, position) in positions.enumerated() {
            let scaled = (position / weldTolerance).rounded(.toNearestOrAwayFromZero)
            let key = WeldKey(x: Int32(clamping: Int(scaled.x)), y: Int32(clamping: Int(scaled.y)), z: Int32(clamping: Int(scaled.z)))
            if let existing = canonical[key] {
                result[index] = existing
            } else {
                canonical[key] = UInt32(index)
                result[index] = UInt32(index)
            }
        }
        return result
    }

    private static func readTriangles(_ submeshes: [MDLSubmesh]) -> [Triangle] {
        var triangles: [Triangle] = []
        for (submeshIndex, submesh) in submeshes.enumerated() {
            let buffer = submesh.indexBuffer(asIndexType: .uInt32)
            let map = buffer.map()
            let count = submesh.indexCount - submesh.indexCount % 3
            withExtendedLifetime(map) {
                let indices = map.bytes.bindMemory(to: UInt32.self, capacity: count)
                triangles.reserveCapacity(triangles.count + count / 3)
                for start in stride(from: 0, to: count, by: 3) {
                    triangles.append(Triangle(submesh: submeshIndex, a: indices[start], b: indices[start + 1], c: indices[start + 2]))
                }
            }
        }
        return triangles
    }

    private static func isDegenerate(_ t: Triangle, welded: [UInt32], positions: [SIMD3<Float>]) -> Bool {
        let count = UInt32(positions.count)
        guard t.a < count, t.b < count, t.c < count else { return true }
        let wa = welded[Int(t.a)], wb = welded[Int(t.b)], wc = welded[Int(t.c)]
        if wa == wb || wb == wc || wa == wc { return true }
        let area = simd_length(simd_cross(positions[Int(t.b)] - positions[Int(t.a)], positions[Int(t.c)] - positions[Int(t.a)]))
        return area < 1e-12
    }

    private static func keepMainComponents(_ triangles: [Triangle], welded: [UInt32]) -> (kept: [Triangle], droppedComponents: Int) {
        var sets = DisjointSet(count: welded.count)
        for t in triangles {
            let a = Int(welded[Int(t.a)]), b = Int(welded[Int(t.b)]), c = Int(welded[Int(t.c)])
            sets.union(a, b)
            sets.union(b, c)
        }
        var sizes: [Int: Int] = [:]
        for t in triangles {
            sizes[sets.find(Int(welded[Int(t.a)])), default: 0] += 1
        }
        guard let largest = sizes.values.max(), sizes.count > 1 else {
            return (triangles, 0)
        }
        let threshold = Int((Double(largest) * minimumComponentShare).rounded(.up))
        let keptRoots = Set(sizes.filter { $0.value >= threshold }.keys)
        let kept = triangles.filter { keptRoots.contains(sets.find(Int(welded[Int($0.a)]))) }
        return (kept, sizes.count - keptRoots.count)
    }

    /// Returns new positions keyed by welded vertex for vertices on simple
    /// open boundary loops (exactly two boundary neighbours).
    private static func smoothBoundaries(_ triangles: [Triangle], welded: [UInt32], positions: [SIMD3<Float>]) -> [UInt32: SIMD3<Float>] {
        var edgeUse: [UInt64: Int] = [:]
        edgeUse.reserveCapacity(triangles.count * 3)
        for t in triangles {
            let a = welded[Int(t.a)], b = welded[Int(t.b)], c = welded[Int(t.c)]
            for (u, v) in [(a, b), (b, c), (c, a)] {
                edgeUse[edgeKey(u, v), default: 0] += 1
            }
        }
        var neighbours: [UInt32: [UInt32]] = [:]
        for (key, uses) in edgeUse where uses == 1 {
            let u = UInt32(truncatingIfNeeded: key >> 32)
            let v = UInt32(truncatingIfNeeded: key)
            neighbours[u, default: []].append(v)
            neighbours[v, default: []].append(u)
        }
        let loop = neighbours.filter { $0.value.count == 2 }
        guard !loop.isEmpty else { return [:] }

        var current: [UInt32: SIMD3<Float>] = [:]
        for vertex in loop.keys {
            current[vertex] = positions[Int(vertex)]
        }
        func step(_ factor: Float) {
            var next = current
            for (vertex, adjacent) in loop {
                guard let p = current[vertex] else { continue }
                let neighbourPositions = adjacent.map { current[$0] ?? positions[Int($0)] }
                let average = neighbourPositions.reduce(SIMD3<Float>.zero, +) / Float(neighbourPositions.count)
                next[vertex] = p + factor * (average - p)
            }
            current = next
        }
        for _ in 0..<boundaryIterations {
            step(0.5)
            step(-0.53)
        }
        return current
    }

    private static func edgeKey(_ u: UInt32, _ v: UInt32) -> UInt64 {
        let low = min(u, v), high = max(u, v)
        return (UInt64(low) << 32) | UInt64(high)
    }

    // MARK: - Rebuild

    private static func rebuild(
        mesh: MDLMesh,
        layout: PositionLayout,
        submeshes: [MDLSubmesh],
        triangles: [Triangle],
        welded: [UInt32],
        smoothed: [UInt32: SIMD3<Float>],
        normals: [UInt32: SIMD3<Float>]
    ) {
        let normalAttribute = mesh.vertexDescriptor.attributeNamed(MDLVertexAttributeNormal)
        let normalBuffer = normalAttribute.flatMap { $0.format == .float3 || $0.format == .float4 ? $0.bufferIndex : nil }
        let normalOffset = normalAttribute?.offset ?? 0
        var remap = [Int32](repeating: -1, count: mesh.vertexCount)
        var order: [Int] = []
        order.reserveCapacity(mesh.vertexCount)
        for t in triangles {
            for raw in [Int(t.a), Int(t.b), Int(t.c)] where remap[raw] < 0 {
                remap[raw] = Int32(order.count)
                order.append(raw)
            }
        }

        var newBuffers: [MDLMeshBuffer] = []
        for (bufferIndex, buffer) in mesh.vertexBuffers.enumerated() {
            guard let bufferLayout = mesh.vertexDescriptor.layouts[bufferIndex] as? MDLVertexBufferLayout,
                  bufferLayout.stride > 0 else {
                return
            }
            let stride = bufferLayout.stride
            let map = buffer.map()
            var data = Data(count: order.count * stride)
            data.withUnsafeMutableBytes { destination in
                guard let base = destination.baseAddress else { return }
                withExtendedLifetime(map) {
                    for (newIndex, raw) in order.enumerated() {
                        (base + newIndex * stride).copyMemory(from: map.bytes + raw * stride, byteCount: stride)
                    }
                }
                if bufferIndex == layout.bufferIndex {
                    for (newIndex, raw) in order.enumerated() {
                        guard let p = smoothed[welded[raw]] else { continue }
                        let target = (base + newIndex * stride + layout.offset).assumingMemoryBound(to: Float.self)
                        target[0] = p.x
                        target[1] = p.y
                        target[2] = p.z
                    }
                }
                if bufferIndex == normalBuffer {
                    for (newIndex, raw) in order.enumerated() {
                        guard let n = normals[welded[raw]] else { continue }
                        let target = (base + newIndex * stride + normalOffset).assumingMemoryBound(to: Float.self)
                        target[0] = n.x
                        target[1] = n.y
                        target[2] = n.z
                    }
                }
            }
            newBuffers.append(mesh.allocator.newBuffer(with: data, type: .vertex))
        }

        var perSubmesh = Array(repeating: [UInt32](), count: submeshes.count)
        for t in triangles {
            perSubmesh[t.submesh].append(contentsOf: [UInt32(remap[Int(t.a)]), UInt32(remap[Int(t.b)]), UInt32(remap[Int(t.c)])])
        }
        let rebuilt = submeshes.enumerated().map { index, original -> MDLSubmesh in
            let indices = perSubmesh[index]
            let data = indices.withUnsafeBufferPointer { Data(buffer: $0) }
            return MDLSubmesh(
                name: original.name,
                indexBuffer: mesh.allocator.newBuffer(with: data, type: .index),
                indexCount: indices.count,
                indexType: .uInt32,
                geometryType: .triangles,
                material: original.material
            )
        }

        mesh.vertexBuffers = newBuffers
        mesh.vertexCount = order.count
        mesh.submeshes = NSMutableArray(array: rebuilt)
    }
}

private struct PositionLayout {
    let bufferIndex: Int
    let offset: Int
    let stride: Int

    init?(mesh: MDLMesh) {
        guard let attribute = mesh.vertexDescriptor.attributeNamed(MDLVertexAttributePosition),
              attribute.format == .float3 || attribute.format == .float4,
              attribute.bufferIndex < mesh.vertexBuffers.count,
              let layout = mesh.vertexDescriptor.layouts[attribute.bufferIndex] as? MDLVertexBufferLayout,
              layout.stride > 0 else {
            return nil
        }
        bufferIndex = attribute.bufferIndex
        offset = attribute.offset
        stride = layout.stride
    }

    func readPositions(mesh: MDLMesh) -> [SIMD3<Float>] {
        let map = mesh.vertexBuffers[bufferIndex].map()
        return withExtendedLifetime(map) {
            (0..<mesh.vertexCount).map { index in
                let floats = (map.bytes + index * stride + offset).assumingMemoryBound(to: Float.self)
                return SIMD3(floats[0], floats[1], floats[2])
            }
        }
    }
}

private struct DisjointSet {
    private var parent: [Int]
    private var rank: [UInt8]

    init(count: Int) {
        parent = Array(0..<count)
        rank = [UInt8](repeating: 0, count: count)
    }

    mutating func find(_ x: Int) -> Int {
        var root = x
        while parent[root] != root { root = parent[root] }
        var node = x
        while parent[node] != root {
            let next = parent[node]
            parent[node] = root
            node = next
        }
        return root
    }

    mutating func union(_ a: Int, _ b: Int) {
        let rootA = find(a), rootB = find(b)
        guard rootA != rootB else { return }
        if rank[rootA] < rank[rootB] {
            parent[rootA] = rootB
        } else if rank[rootA] > rank[rootB] {
            parent[rootB] = rootA
        } else {
            parent[rootB] = rootA
            rank[rootA] += 1
        }
    }
}
