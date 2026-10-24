import Foundation

protocol EngineClient {
    func diff(baseID: UUID, newID: UUID) async throws -> DiffResult
}

enum EngineClients {
    static func make() -> any EngineClient {
        if let url = AppSecrets.engineURL {
            return LiveEngineClient(baseURL: url)
        }
        return MockEngineClient()
    }
}

struct LiveEngineClient: EngineClient {
    var baseURL: URL

    func diff(baseID: UUID, newID: UUID) async throws -> DiffResult {
        let endpoint = baseURL.appendingPathComponent("diff")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(DiffBody(base_id: baseID.uuidString, new_id: newID.uuidString))
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ScanError.engineFailed("The diff service did not respond.")
        }
        guard (200..<300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? ""
            throw ScanError.engineFailed("Diff service returned \(http.statusCode). \(detail)")
        }
        return try DiffDecoding.parse(data)
    }
}

struct MockEngineClient: EngineClient {
    func diff(baseID: UUID, newID: UUID) async throws -> DiffResult {
        try await Task.sleep(for: .milliseconds(300))
        return DiffResult(
            heatmapURL: nil,
            histogramBins: [0.05, 0.22, 0.61, 0.12],
            regions: [
                DiffRegion(id: "rim", label: "Rim", score: 0.62),
                DiffRegion(id: "body", label: "Body", score: 0.41)
            ],
            verdict: "possible damage",
            confidence: 0.74,
            usedMock: true
        )
    }
}

private struct DiffBody: Encodable {
    let base_id: String
    let new_id: String
}

enum DiffDecoding {
    static func parse(_ data: Data) throws -> DiffResult {
        let object = try JSONSerialization.jsonObject(with: data)
        guard let json = object as? [String: Any] else {
            throw ScanError.engineFailed("Diff response was not a JSON object.")
        }
        let verdict = json["verdict"] as? String ?? "unknown"
        let confidence = number(json["confidence"]) ?? 0
        let heatmap = (json["heatmap_url"] as? String).flatMap(URL.init(string:))
        return DiffResult(
            heatmapURL: heatmap,
            histogramBins: bins(json["histogram"]),
            regions: regions(json["regions"]),
            verdict: verdict,
            confidence: confidence,
            usedMock: false
        )
    }

    private static func number(_ value: Any?) -> Double? {
        if let number = value as? Double { return number }
        if let number = value as? Int { return Double(number) }
        return nil
    }

    private static func bins(_ value: Any?) -> [Double] {
        if let numbers = value as? [Double] { return numbers }
        if let numbers = value as? [Int] { return numbers.map(Double.init) }
        if let object = value as? [String: Any] {
            return object.values.compactMap(number)
        }
        return []
    }

    private static func regions(_ value: Any?) -> [DiffRegion] {
        guard let rows = value as? [Any] else { return [] }
        var result: [DiffRegion] = []
        for (index, row) in rows.enumerated() {
            guard let object = row as? [String: Any] else { continue }
            let label = (object["label"] as? String)
                ?? (object["name"] as? String)
                ?? (object["id"] as? String)
                ?? "Region \(index + 1)"
            let id = (object["id"] as? String) ?? "region-\(index)"
            result.append(DiffRegion(id: "\(id)-\(index)", label: label, score: number(object["score"]) ?? number(object["confidence"])))
        }
        return result
    }
}
