import XCTest
@testable import ScanDiff

final class EngineFailoverTests: XCTestCase {
    func testUnreachableEnginesFailWithBothHostsNamed() async {
        // Port 9 (discard) is closed on the simulator host, so both fail fast.
        let client = FailoverEngineClient(candidates: [
            URL(string: "http://127.0.0.1:9")!,
            URL(string: "http://localhost:9")!
        ])
        do {
            _ = try await client.diff(baseID: UUID(), newID: UUID())
            XCTFail("Expected an error")
        } catch {
            let message = error.localizedDescription
            XCTAssertTrue(message.contains("127.0.0.1"), message)
            XCTAssertTrue(message.contains("localhost"), message)
        }
    }
}
