import ModelIO
import XCTest
@testable import ScanDiff

final class ModelSizeTests: XCTestCase {
    private func size(_ x: Float, _ y: Float, _ z: Float, triangles: Int = 40_000) -> ModelSize {
        ModelSize(dimensionsCM: SIMD3(x, y, z), vertices: triangles / 2, triangles: triangles)
    }

    func testMugSizedModelPasses() {
        XCTAssertTrue(size(9, 8, 10).isAcceptable)
    }

    func testOneCentimeterBoxFails() {
        XCTAssertFalse(size(1, 1, 1).isAcceptable)
    }

    func testThinSheetFails() {
        XCTAssertFalse(size(9, 8, 0.2).isAcceptable)
    }

    func testTooFewTrianglesFails() {
        XCTAssertFalse(size(9, 8, 10, triangles: 1_500).isAcceptable)
    }

    func testEmptyModelFails() {
        XCTAssertFalse(ModelSize(dimensionsCM: .zero, vertices: 0, triangles: 0).isAcceptable)
    }

    func testLimitsAreLoose() {
        // Small but real objects (a ring box, a flat card case) must pass.
        XCTAssertTrue(size(3, 3, 0.3, triangles: 2_000).isAcceptable)
    }

    func testRejectionMessageOnlyForBadModels() {
        let good = ScanQuality(shotCount: 40, completedOrbit: true, savedPhotoCount: 10, modelSize: size(9, 8, 10))
        XCTAssertNil(good.rejection)
        let bad = ScanQuality(shotCount: 40, completedOrbit: true, savedPhotoCount: 10, modelSize: size(1, 1, 1))
        XCTAssertTrue(bad.rejection?.hasPrefix("Model looks too small or incomplete") ?? false)
    }

    func testMeasuresARealMeshInCentimeters() throws {
        let mesh = MDLMesh(
            boxWithExtent: SIMD3(0.09, 0.08, 0.10),
            segments: SIMD3(20, 20, 20),
            inwardNormals: false,
            geometryType: .triangles,
            allocator: nil
        )
        let measured = MeshCleaner.measure([mesh])
        XCTAssertEqual(measured.dimensionsCM.x, 9, accuracy: 0.01)
        XCTAssertEqual(measured.dimensionsCM.y, 8, accuracy: 0.01)
        XCTAssertEqual(measured.dimensionsCM.z, 10, accuracy: 0.01)
        XCTAssertGreaterThanOrEqual(measured.triangles, ModelSize.Limits.minTriangles)
        XCTAssertTrue(measured.isAcceptable)
    }
}
