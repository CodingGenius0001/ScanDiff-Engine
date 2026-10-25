import XCTest
@testable import ScanDiff

final class ContractDecodingTests: XCTestCase {
    /// contract/diff_response.json at the repo root: a real engine response.
    private var canonicalSample: Data {
        get throws {
            let root = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
            return try Data(contentsOf: root.appendingPathComponent("contract/diff_response.json"))
        }
    }

    func testCanonicalSampleDecodes() throws {
        let result = try DiffResult.decode(canonicalSample)
        XCTAssertEqual(result.triage, .damage)
        XCTAssertEqual(result.verdict, "damage_likely")
        XCTAssertEqual(result.confidence, 0.5223, accuracy: 0.001, "confidence must come through, not default to 0")
        XCTAssertNotNil(result.reason)
        XCTAssertFalse(result.isMock)
        XCTAssertNil(result.comparedFraction)
        XCTAssertEqual(result.regions.count, 3)
        XCTAssertEqual(result.histogram.edgesMM.count, result.histogram.counts.count + 1)
        XCTAssertNotNil(result.heatmapURL)
        let damage = try XCTUnwrap(result.regions.first { $0.triage == .damage })
        XCTAssertNotNil(damage.maxMM)
        XCTAssertEqual(damage.centroidM?.count, 3)
        XCTAssertNotEqual(damage.title, "Change")
    }

    func testLegacyNamesDecode() throws {
        let json = """
        {"verdict": "accept", "confidence": 0.9, "reason": "No changes.",
         "histogram": {"bins_mm": [0, 1, 2], "counts": [5, 1]},
         "regions": [], "compared_fraction": 0.82, "heatmap_url": "https://example.com/h.glb"}
        """
        let result = try DiffResult.decode(Data(json.utf8))
        XCTAssertEqual(result.triage, .noChange)
        XCTAssertEqual(result.confidence, 0.9)
        XCTAssertEqual(result.comparedFraction, 0.82)
        XCTAssertEqual(result.histogram.edgesMM, [0, 1, 2])
    }

    func testEngineVerdictsMapToTriage() {
        XCTAssertEqual(Triage.from(verdict: "accept", hasRegions: false), .noChange)
        XCTAssertEqual(Triage.from(verdict: "accept", hasRegions: true), .wear)
        XCTAssertEqual(Triage.from(verdict: "damage_likely", hasRegions: true), .damage)
        XCTAssertEqual(Triage.from(verdict: "needs_review", hasRegions: false), .inconclusive)
        XCTAssertEqual(Triage.from(verdict: "wear", hasRegions: true), .wear)
        XCTAssertEqual(Triage.from(verdict: "something_new", hasRegions: false), .inconclusive)
        XCTAssertEqual(Triage.from(verdict: nil, hasRegions: false), .inconclusive)
    }

    func testEmptyObjectIsInconclusiveNotACrash() throws {
        let result = try DiffResult.decode(Data("{}".utf8))
        XCTAssertEqual(result.triage, .inconclusive)
        XCTAssertEqual(result.confidence, 0)
        XCTAssertTrue(result.regions.isEmpty)
    }

    func testConfidenceIsClamped() throws {
        let result = try DiffResult.decode(Data(#"{"verdict_confidence": 1.7}"#.utf8))
        XCTAssertEqual(result.confidence, 1)
    }

    func testGarbageThrowsReadableError() {
        XCTAssertThrowsError(try DiffResult.decode(Data("not json".utf8))) { error in
            XCTAssertTrue(error.localizedDescription.contains("could not be read"))
        }
    }

    func testEngineErrorDetailIsShown() {
        let body = Data(#"{"detail": "Bounding boxes differ by 54% on one axis."}"#.utf8)
        let message = LiveEngineClient.message(status: 422, body: body)
        XCTAssertTrue(message.contains("Bounding boxes differ"))
        XCTAssertTrue(message.contains("Re-scan"))
    }
}
