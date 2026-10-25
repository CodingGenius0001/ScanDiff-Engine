import XCTest
@testable import ScanDiff

final class DeepLinkTests: XCTestCase {
    private func parse(_ string: String) -> Result<ScanRequest, ScanError> {
        guard let url = URL(string: string) else {
            return .failure(.invalidItemID)
        }
        return DeepLink.parse(url)
    }

    func testValidBaselineLink() throws {
        let request = try parse("scandiff://scan?item=coffee-maker-1&kind=baseline").get()
        XCTAssertEqual(request, ScanRequest(itemID: "coffee-maker-1", kind: .baseline))
    }

    func testCheckKindAndCaseInsensitiveScheme() throws {
        let request = try parse("SCANDIFF://Scan?item=Mug-01&kind=CHECK").get()
        XCTAssertEqual(request, ScanRequest(itemID: "mug-01", kind: .check))
    }

    func testItemIDIsNormalizedToKebabCase() throws {
        let request = try parse("scandiff://scan?item=Coffee%20Maker_1&kind=baseline").get()
        XCTAssertEqual(request.itemID, "coffee-maker-1")
    }

    func testMissingKindDefaultsToBaseline() throws {
        XCTAssertEqual(try parse("scandiff://scan?item=123").get().kind, .baseline)
    }

    func testRejectsBadInput() {
        for link in [
            "scandiff://scan",
            "scandiff://scan?item=",
            "scandiff://scan?item=%20%20",
            "scandiff://scan?item=!!!",
            "scandiff://scan?item=mug&kind=calibrate",
            "scandiff://login-callback?code=1",
            "https://example.com/scan?item=mug",
            "otherapp://scan?item=mug"
        ] {
            if case .success(let request) = parse(link) {
                XCTFail("\(link) should be rejected, got \(request)")
            }
        }
    }

    func testItemIDNormalization() {
        XCTAssertEqual(ItemID.normalize("  Coffee  Maker--1 "), "coffee-maker-1")
        XCTAssertEqual(ItemID.normalize("shoe_01"), "shoe-01")
        XCTAssertEqual(ItemID.normalize("-mug-"), "mug")
        XCTAssertEqual(ItemID.normalize("___"), "")
        XCTAssertFalse(ItemID.isValid("!!"))
        XCTAssertTrue(ItemID.isValid("A"))
    }
}
