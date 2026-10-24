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
        let version = try await nextVersion(client: client, itemID: itemID)
        let baselineID = scan.metadata.kind == ScanKind.check.rawValue
            ? try await latestBaselineID(client: client, itemID: itemID)
            : nil

        let folder = "\(itemID)/\(scanID)"
        let files = try regularFiles(in: scan.directory)
        for file in files {
            let relative = file.lastPathComponent
            try await client.storage
                .from("scans")
                .upload(
                    "\(folder)/\(relative)",
                    fileURL: file,
                    options: FileOptions(contentType: mimeType(for: file), upsert: true)
                )
        }

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

    private func makeClient() throws -> SupabaseClient {
        guard let url = AppSecrets.supabaseURL, let key = AppSecrets.supabaseAnonKey else {
            throw ScanError.missingSecrets
        }
        return SupabaseClient(supabaseURL: url, supabaseKey: key)
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
