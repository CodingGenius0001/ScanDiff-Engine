import CryptoKit
import Foundation

enum Hashing {
    /// Streams the file in 1 MB chunks so large models never load fully into memory.
    static func sha256Hex(of url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 1024 * 1024), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// Hashes every file concurrently; results keep the input order.
    static func sha256Hex(of urls: [URL]) throws -> [String] {
        var results = [Result<String, Error>?](repeating: nil, count: urls.count)
        results.withUnsafeMutableBufferPointer { buffer in
            guard let base = buffer.baseAddress else { return }
            DispatchQueue.concurrentPerform(iterations: urls.count) { index in
                base[index] = Result { try sha256Hex(of: urls[index]) }
            }
        }
        return try results.map { result in
            guard let result else { throw ScanError.missingModel }
            return try result.get()
        }
    }
}
