import XCTest
@testable import ScanDiff

final class MetadataAndHashingTests: XCTestCase {
    private func temporaryFile(_ data: Data) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try data.write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    func testSHA256OfKnownFixtures() throws {
        XCTAssertEqual(
            try Hashing.sha256Hex(of: temporaryFile(Data("abc".utf8))),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
        XCTAssertEqual(
            try Hashing.sha256Hex(of: temporaryFile(Data())),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        )
    }

    func testSHA256StreamsLargeFilesAcrossChunks() throws {
        // 2.5 MB of "a", larger than the 1 MB read chunk.
        let url = try temporaryFile(Data(repeating: 0x61, count: 2_500_000))
        let streamed = try Hashing.sha256Hex(of: url)
        XCTAssertEqual(try Hashing.sha256Hex(of: [url, url]), [streamed, streamed])
        XCTAssertEqual(streamed.count, 64)
    }

    func testMetadataEncodesTheEngineSchema() throws {
        let transform: [Float] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.1, 0.2, 0.3, 1]
        let metadata = ScanMetadata(
            scan_id: "E10EF66F-0C5C-4703-9F92-26DAEFCE4113",
            item_id: "charger-1",
            kind: "check",
            created_by: "8b1f6c1e-1111-2222-3333-444455556666",
            created_at: Timestamps.iso8601UTC(Date(timeIntervalSince1970: 0)),
            device: "iPhone18,2",
            ios_version: "27.0",
            image_count: 84,
            model_file: "model.usdz",
            model_sha256: String(repeating: "a", count: 64),
            obj_file: "model.obj",
            material_file: "model.mtl",
            textures: [TextureRecord(file: "texture_0.png", sha256: String(repeating: "b", count: 64))],
            mesh_cleanup: MeshCleanupSummary(),
            files: [FileRecord(name: "model.usdz", sha256: String(repeating: "a", count: 64))],
            photos: [PhotoRecord(file: "photo_01.jpg", camera_transform: transform, intrinsics: [2947, 0, 0, 0, 2947, 0, 2016, 1512, 1], image_width: 4032, image_height: 3024)]
        )
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(metadata)) as? [String: Any])
        for key in ["scan_id", "item_id", "kind", "created_by", "created_at", "device", "ios_version", "image_count",
                    "model_file", "model_sha256", "textures", "files", "photos"] {
            XCTAssertNotNil(object[key], "metadata.json is missing \(key)")
        }
        XCTAssertEqual(object["created_at"] as? String, "1970-01-01T00:00:00Z")
        let texture = try XCTUnwrap((object["textures"] as? [[String: Any]])?.first)
        XCTAssertEqual(Set(texture.keys), ["file", "sha256"], "the engine's TextureFile is {file, sha256}")
        let photo = try XCTUnwrap((object["photos"] as? [[String: Any]])?.first)
        XCTAssertEqual((photo["camera_transform"] as? [Double])?.count, 16)
        XCTAssertEqual((photo["camera_transform"] as? [Double])?.last, 1, "column-major: last element is 1")
        XCTAssertEqual((photo["intrinsics"] as? [Double])?.count, 9)
        XCTAssertEqual(photo["image_width"] as? Int, 4032)
        XCTAssertEqual(photo["image_height"] as? Int, 3024)
        XCTAssertNil(photo["width"], "the engine reads image_width, not width")
    }

    func testMaterialFileMakesTexturesLoadable() throws {
        let mtl = """
        newmtl Texture
        \tmap_Kd /texture_0.png
        \tKd 0.18 0.18 0.18
        \tmap_tangentSpaceNormal /texture_1.png
        """
        let url = try temporaryFile(Data(mtl.utf8))
        let textures = try MaterialFile.normalize(at: url)
        let rewritten = try String(contentsOf: url, encoding: .utf8)
        XCTAssertEqual(textures, ["texture_0.png", "texture_1.png"])
        XCTAssertTrue(rewritten.contains("map_Kd texture_0.png"))
        XCTAssertTrue(rewritten.contains("Kd 1 1 1"))
        XCTAssertTrue(rewritten.contains("norm texture_1.png"))
        XCTAssertFalse(rewritten.contains("/texture_"))
    }
}
