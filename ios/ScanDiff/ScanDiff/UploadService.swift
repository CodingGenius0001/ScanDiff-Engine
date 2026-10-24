import Foundation
import Supabase

struct ScanInsert: Encodable {
    let id: String
    let item_id: String
    let version: Int
    let kind: String
    let model_url: String
    let sha256: String
    let created_by: String
    let created_at: String
}

struct DecisionWrite: Encodable {
    let decision: String
}

private struct VersionRow: Decodable {
    let version: Int
}

private struct BaselineRow: Decodable {
    let id: UUID
}

struct UploadService {
    func upload(_ scan: PreparedScan) async throws -> UploadReceipt {
        let client = try makeClient()
        let itemID = scan.metadata.item_id
        let scanID = scan.metadata.scan_id
        let isCheck = scan.metadata.kind == ScanKind.check.rawValue
        async let nextVersionNumber = nextVersion(client: client, itemID: itemID)
        async let baseline = isCheck ? latestBaselineID(client: client, itemID: itemID) : nil

        let folder = "\(itemID)/\(scanID)"
        try await uploadFiles(try regularFiles(in: scan.directory), to: folder, client: client)
        let (version, baselineID) = try await (nextVersionNumber, baseline)

        let modelPath = "\(folder)/\(ScanBundle.modelFileName)"
        let publicURL = try client.storage.from("scans").getPublicURL(path: modelPath)
        let row = ScanInsert(
            id: scanID,
            item_id: itemID,
            version: version,
            kind: scan.metadata.kind,
            model_url: publicURL.absoluteString,
            sha256: scan.metadata.model_sha256,
            created_by: scan.metadata.created_by,
            created_at: scan.metadata.created_at
        )
        do {
            try await client.from("scans").insert(row).execute()
        } catch {
            throw ScanError.uploadFailed(error.localizedDescription)
        }

        guard let parsedID = UUID(uuidString: scanID) else {
            throw ScanError.uploadFailed("Scan id was not a UUID.")
        }
        return UploadReceipt(
            scanID: parsedID,
            modelURL: publicURL,
            baselineID: baselineID,
            version: version
        )
    }

    func writeDecision(scanID: UUID, decision: String) async throws {
        let client = try makeClient()
        do {
            try await client
                .from("scans")
                .update(DecisionWrite(decision: decision))
                .eq("id", value: scanID.uuidString)
                .execute()
        } catch {
            throw ScanError.decisionFailed(error.localizedDescription)
        }
    }

    private static let maxConcurrentUploads = 4

    /// Keeps a fixed number of uploads in flight instead of sending files one by one.
    private func uploadFiles(_ files: [URL], to folder: String, client: SupabaseClient) async throws {
        let jobs = files.map { file in
            (path: "\(folder)/\(file.lastPathComponent)", file: file, contentType: mimeType(for: file))
        }
        var pending = jobs[...]
        do {
            try await withThrowingTaskGroup(of: Void.self) { group in
                func enqueueNext() {
                    guard let job = pending.popFirst() else { return }
                    group.addTask {
                        try await Self.withRetry {
                            _ = try await client.storage
                                .from("scans")
                                .upload(
                                    job.path,
                                    fileURL: job.file,
                                    options: FileOptions(contentType: job.contentType, upsert: true)
                                )
                        }
                    }
                }
                for _ in 0..<Self.maxConcurrentUploads {
                    enqueueNext()
                }
                while try await group.next() != nil {
                    enqueueNext()
                }
            }
        } catch {
            throw ScanError.uploadFailed(error.localizedDescription)
        }
    }

    /// Safe to repeat because every file is written with upsert.
    private static func withRetry(attempts: Int = 3, _ operation: () async throws -> Void) async throws {
        for attempt in 1...attempts {
            do {
                try await operation()
                return
            } catch {
                if attempt == attempts || Task.isCancelled { throw error }
                Diagnostics.log("upload retry \(attempt) after: \(error.localizedDescription)")
                try await Task.sleep(for: .seconds(Double(attempt)))
            }
        }
    }

    private func makeClient() throws -> SupabaseClient {
        guard let client = SupabaseProvider.client else {
            throw ScanError.missingSecrets
        }
        return client
    }

    private func nextVersion(client: SupabaseClient, itemID: String) async throws -> Int {
        do {
            let rows: [VersionRow] = try await client
                .from("scans")
                .select("version")
                .eq("item_id", value: itemID)
                .order("version", ascending: false)
                .limit(1)
                .execute()
                .value
            return (rows.first?.version ?? 0) + 1
        } catch {
            throw ScanError.uploadFailed(error.localizedDescription)
        }
    }

    private func latestBaselineID(client: SupabaseClient, itemID: String) async throws -> UUID? {
        do {
            let rows: [BaselineRow] = try await client
                .from("scans")
                .select("id")
                .eq("item_id", value: itemID)
                .eq("kind", value: ScanKind.baseline.rawValue)
                .order("created_at", ascending: false)
                .limit(1)
                .execute()
                .value
            return rows.first?.id
        } catch {
            throw ScanError.uploadFailed(error.localizedDescription)
        }
    }

    private func regularFiles(in directory: URL) throws -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey]
        ) else {
            return []
        }
        var files: [URL] = []
        for case let url as URL in enumerator {
            let values = try url.resourceValues(forKeys: [.isRegularFileKey])
            if values.isRegularFile == true {
                files.append(url)
            }
        }
        return files.sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    private func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "usdz": "model/vnd.usdz+zip"
        case "obj": "model/obj"
        case "mtl": "model/mtl"
        case "jpg", "jpeg": "image/jpeg"
        case "png": "image/png"
        case "json": "application/json"
        case "heic": "image/heic"
        default: "application/octet-stream"
        }
    }
}
