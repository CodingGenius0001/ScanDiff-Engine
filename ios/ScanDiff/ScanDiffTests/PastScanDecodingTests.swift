import XCTest
@testable import ScanDiff

final class PastScanDecodingTests: XCTestCase {
    func testDecodesScanRowsAsSupabaseReturnsThem() throws {
        let json = Data("""
        [
          {"id": "4d4b567f-8b1a-4146-8f55-ef59ef8a3a07", "item_id": "coffee-maker-1", "version": 1, "kind": "baseline",
           "model_url": "https://example.supabase.co/storage/v1/object/public/scans/coffee-maker-1/4D4B/model.usdz",
           "sha256": "abc", "created_by": "iPhone", "created_at": "2026-10-24T20:11:05.123456+00:00", "decision": null},
          {"id": "e10ef66f-0c5c-4703-9f92-26daefce4113", "item_id": "mug-002", "version": 2, "kind": "check",
           "model_url": null, "sha256": null, "created_by": "a1b2", "created_at": "2026-10-24T21:00:00+00:00", "decision": "accept"},
          {"id": "5336d978-0000-4000-8000-000000000000", "item_id": "x", "version": 1, "kind": "calibration",
           "model_url": "", "sha256": null, "created_by": null, "created_at": "not a date", "decision": null}
        ]
        """.utf8)
        let rows = try JSONDecoder().decode([PastScan].self, from: json)
        XCTAssertEqual(rows.count, 3)
        XCTAssertEqual(rows[0].kind, .baseline)
        XCTAssertNotNil(rows[0].createdAt)
        XCTAssertNotNil(rows[0].modelURL)
        XCTAssertNil(rows[0].decision)
        XCTAssertEqual(rows[1].kind, .check)
        XCTAssertNotNil(rows[1].createdAt)
        XCTAssertEqual(rows[1].decision, "accept")
        XCTAssertNil(rows[1].modelURL)
        XCTAssertEqual(rows[2].kind, .baseline, "Unknown kinds fall back instead of failing the whole list")
        XCTAssertNil(rows[2].createdAt)
    }
}
