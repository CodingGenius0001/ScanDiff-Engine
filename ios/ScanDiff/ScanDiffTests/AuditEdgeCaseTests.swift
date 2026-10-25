import CryptoKit
import XCTest
@testable import ScanDiff

/// Edge cases for the deep link, the contract decoder and the SHA-256 manifest.
final class DeepLinkEdgeCaseTests: XCTestCase {
    private func parse(_ string: String) throws -> Result<ScanRequest, ScanError> {
        DeepLink.parse(try XCTUnwrap(URL(string: string)))
    }

    func testOnlyTheScanDiffSchemeAndScanHostAreAccepted() throws {
        for link in [
            "https://scandiff.us/scan?item=mug-002&kind=check",
            "scandiff://login-callback?item=mug-002",
            "scandiff://item?item=mug-002",
            "otherapp://scan?item=mug-002"
        ] {
            XCTAssertThrowsError(try parse(link).get(), link)
        }
    }

    func testCaseAndPercentEncodingAreNormalized() throws {
        let request = try parse("SCANDIFF://SCAN?item=Mug%20002&kind=CHECK").get()
        XCTAssertEqual(request, ScanRequest(itemID: "mug-002", kind: .check))
    }

    func testTheFirstOfRepeatedParametersWins() throws {
        let request = try parse("scandiff://scan?item=mug-002&item=mug-999&kind=check&kind=baseline").get()
        XCTAssertEqual(request, ScanRequest(itemID: "mug-002", kind: .check))
    }

    func testInviteIsTrimmed() throws {
        XCTAssertEqual(try parse("scandiff://scan?item=mug-002&kind=check&invite=%20abc%20").get().invite, "abc")
        XCTAssertNil(try parse("scandiff://scan?item=mug-002&kind=check&invite=%20%20").get().invite)
    }

    func testUnknownKindsAndEmptyItemsAreRejected() throws {
        XCTAssertThrowsError(try parse("scandiff://scan?item=mug-002&kind=calibration").get())
        XCTAssertThrowsError(try parse("scandiff://scan?item=%20%20&kind=check").get())
        XCTAssertThrowsError(try parse("scandiff://scan?kind=check").get())
    }

    func testNonASCIIIsDroppedTheWayTheWebsiteExpects() throws {
        // The website refuses to draw a QR code for an id the app would rewrite (web/lib/itemId.ts appItemId).
        XCTAssertEqual(try parse("scandiff://scan?item=Caf%C3%A9_1").get().itemID, "caf-1")
        XCTAssertEqual(ItemID.normalize("shoe_01"), "shoe-01")
    }
}

final class ContractDecoderEdgeCaseTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures/\(name).json")
        return try Data(contentsOf: url)
    }

    /// Generated from the repo's engine (app.pipeline.inconclusive), in the contract's field names.
    func testRepoEngineInconclusiveResponse() throws {
        let result = try DiffResult.decode(fixture("engine_repo_inconclusive"))
        XCTAssertEqual(result.triage, .inconclusive)
        XCTAssertEqual(result.headline, "Inconclusive: couldn't compare reliably")
        XCTAssertEqual(result.reason, "Only 35% of the item was captured in both scans; rescan so both cover all of it.")
        XCTAssertEqual(result.comparedFraction ?? 0, 0.3518, accuracy: 1e-9)
        XCTAssertTrue(result.regions.isEmpty)
        XCTAssertNil(result.heatmapURL)
        XCTAssertNil(result.legend)
        XCTAssertNil(result.maxChangeMM)
        XCTAssertFalse(result.isMock)
    }

    /// Generated from the repo's engine (GET /schema/example), in the contract's field names.
    func testRepoEngineMockResponse() throws {
        let result = try DiffResult.decode(fixture("engine_repo_mock"))
        XCTAssertTrue(result.isMock)
        XCTAssertEqual(result.verdict, "needs_review")
        XCTAssertEqual(result.triage, .inconclusive)
        XCTAssertEqual(result.regions.count, 2)
        XCTAssertEqual(Set(result.regions.map(\.triage)), [.wear, .inconclusive])
        XCTAssertTrue(result.regions.allSatisfy { $0.centroidM?.count == 3 && $0.maxMM != nil })
        XCTAssertEqual(result.histogram.edgesMM.count, result.histogram.counts.count + 1)
        XCTAssertNotNil(result.legend)
        XCTAssertNotNil(result.baseModelURL)
        XCTAssertNotNil(result.newModelURL)
        XCTAssertEqual(result.uncoveredCount, 1)
    }

    func testNullsEverywhereDecodeToSafeDefaults() throws {
        let json = #"""
        {"verdict": null, "triage": null, "confidence": null, "verdict_confidence": null, "reason": null,
         "compared_fraction": null, "heatmap_url": null, "histogram": null, "regions": null,
         "uncovered_regions": null, "stats": null, "diff_id": null, "is_mock": null,
         "base_model_url": null, "new_model_url": null, "heatmap_legend": null}
        """#
        let result = try DiffResult.decode(Data(json.utf8))
        XCTAssertEqual(result.triage, .inconclusive)
        XCTAssertEqual(result.confidence, 0)
        XCTAssertTrue(result.regions.isEmpty)
        XCTAssertFalse(result.isMock)
    }

    func testConfidenceIsClampedToZeroOne() throws {
        XCTAssertEqual(try DiffResult.decode(Data(#"{"verdict":"accept","confidence":7}"#.utf8)).confidence, 1)
        XCTAssertEqual(try DiffResult.decode(Data(#"{"verdict":"accept","confidence":-2}"#.utf8)).confidence, 0)
    }

    func testAnUnknownTriageFallsBackToTheVerdict() throws {
        let result = try DiffResult.decode(Data(#"{"verdict":"damage_likely","triage":"catastrophic"}"#.utf8))
        XCTAssertEqual(result.triage, .damage)
    }

    func testARegionWithNothingButALabelStillDecodes() throws {
        let result = try DiffResult.decode(Data(#"{"verdict":"needs_review","regions":[{"label":"missing_part"}]}"#.utf8))
        XCTAssertEqual(result.regions.count, 1)
        XCTAssertEqual(result.regions[0].title, "Missing part")
        XCTAssertEqual(result.regions[0].triage, .inconclusive)
        XCTAssertFalse(result.regions[0].id.isEmpty)
    }

    func testMalformedJSONIsAReadableEngineError() {
        for body in ["", "not json", "[]", "42"] {
            XCTAssertThrowsError(try DiffResult.decode(Data(body.utf8)), body) { error in
                XCTAssertTrue(error.localizedDescription.contains("could not be read"), error.localizedDescription)
            }
        }
    }
}

final class ManifestHashingEdgeCaseTests: XCTestCase {
    private var folder: URL!

    override func setUpWithError() throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: folder)
    }

    private func write(_ name: String, _ data: Data) throws -> URL {
        let url = folder.appendingPathComponent(name)
        try data.write(to: url)
        return url
    }

    func testEmptyFileHasTheWellKnownDigest() throws {
        XCTAssertEqual(
            try Hashing.sha256Hex(of: write("empty", Data())),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        )
    }

    func testStreamingMatchesOneShotAtChunkBoundaries() throws {
        for size in [1, 1024 * 1024 - 1, 1024 * 1024, 1024 * 1024 + 1, 3 * 1024 * 1024 + 7] {
            let data = Data((0..<size).map { UInt8(truncatingIfNeeded: $0 &* 31) })
            let expected = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            XCTAssertEqual(try Hashing.sha256Hex(of: write("f\(size)", data)), expected, "size \(size)")
        }
    }

    func testConcurrentHashingKeepsInputOrder() throws {
        let urls = try (0..<24).map { try write("p\($0)", Data("photo \($0)".utf8)) }
        let expected = try urls.map { try Hashing.sha256Hex(of: $0) }
        XCTAssertEqual(try Hashing.sha256Hex(of: urls), expected)
        XCTAssertEqual(Set(expected).count, urls.count)
    }

    func testAMissingFileThrowsInsteadOfHashingNothing() throws {
        let missing = folder.appendingPathComponent("gone.jpg")
        XCTAssertThrowsError(try Hashing.sha256Hex(of: missing))
        XCTAssertThrowsError(try Hashing.sha256Hex(of: [try write("ok", Data("x".utf8)), missing]))
    }

    func testOneChangedByteChangesTheDigest() throws {
        var data = Data(repeating: 7, count: 4096)
        let before = try Hashing.sha256Hex(of: write("a", data))
        data[2048] ^= 1
        XCTAssertNotEqual(try Hashing.sha256Hex(of: write("b", data)), before)
    }
}
