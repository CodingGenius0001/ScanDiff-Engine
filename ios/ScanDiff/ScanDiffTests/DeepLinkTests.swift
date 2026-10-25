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

    func testInviteCodeFromCheckInLink() throws {
        let request = try parse("scandiff://scan?item=mug-002&kind=check&invite=6c8ff8224c5929d083ccb593").get()
        XCTAssertEqual(request, ScanRequest(itemID: "mug-002", kind: .check, invite: "6c8ff8224c5929d083ccb593"))
        XCTAssertNil(try parse("scandiff://scan?item=mug-002&kind=check&invite=").get().invite)
        XCTAssertNil(try parse("scandiff://scan?item=mug-002&kind=check").get().invite)
    }

    func testScanLinkCarriesInviteOnlyOnCheckIns() throws {
        let check = ScanLink.url(itemID: "mug-002", kind: .check, invite: "abc123")
        XCTAssertEqual(try DeepLink.parse(check).get(), ScanRequest(itemID: "mug-002", kind: .check, invite: "abc123"))
        let baseline = ScanLink.url(itemID: "mug-002", kind: .baseline, invite: "abc123")
        XCTAssertNil(try DeepLink.parse(baseline).get().invite)
    }

    func testShareLinks() throws {
        let share = try XCTUnwrap(URL(string: "https://scandiff.us/join/mug-002?code=abc123&to=checkout"))
        let parsed = try XCTUnwrap(AppModel.shareLink(in: share))
        XCTAssertEqual(parsed.itemID, "mug-002")
        XCTAssertEqual(parsed.code, "abc123")
        XCTAssertEqual(AppModel.caseFileID(in: share), "mug-002")
        XCTAssertEqual(AppModel.shareLink(in: WebLinks.join("mug-002", code: "abc123"))?.code, "abc123")
        // Not share links: no code, or an ordinary item page.
        XCTAssertNil(AppModel.shareLink(in: try XCTUnwrap(URL(string: "https://scandiff.us/join/mug-002"))))
        XCTAssertNil(AppModel.shareLink(in: try XCTUnwrap(URL(string: "https://scandiff.us/item/mug-002?code=abc123"))))
        XCTAssertNil(AppModel.shareLink(in: try XCTUnwrap(URL(string: "https://evil.example/join/mug-002?code=abc123"))))
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
