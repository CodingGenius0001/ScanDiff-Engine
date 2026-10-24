import Foundation

/// ModelIO writes MTL files that standard viewers render without color:
/// texture paths are absolute device paths ("/texture_0.png"), the diffuse
/// color is 0.18 grey (viewers multiply it into the texture), and the normal
/// map uses a non-standard key. This rewrites the file so OBJ loaders such as
/// three.js MTLLoader and trimesh show the textures.
enum MaterialFile {
    /// Returns the texture file names the material references, in order.
    @discardableResult
    static func normalize(at url: URL) throws -> [String] {
        let original = try String(contentsOf: url, encoding: .utf8)
        var textures: [String] = []
        var blocks: [[String]] = [[]]
        for rawLine in original.components(separatedBy: .newlines) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("newmtl ") {
                blocks.append([line])
            } else {
                blocks[blocks.count - 1].append(rewrite(line, textures: &textures))
            }
        }
        let output = blocks.map(whitenDiffuseIfTextured).flatMap { $0 }.joined(separator: "\n")
        try output.write(to: url, atomically: true, encoding: .utf8)
        return textures
    }

    private static func rewrite(_ line: String, textures: inout [String]) -> String {
        let parts = line.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
        guard parts.count == 2 else { return line }
        var key = String(parts[0])
        let value = String(parts[1])
        guard key.lowercased().hasPrefix("map_") || key == "norm" || key == "bump" else {
            return line
        }
        if key == "map_tangentSpaceNormal" {
            key = "norm"
        }
        let name = URL(fileURLWithPath: value).lastPathComponent
        if !textures.contains(name) {
            textures.append(name)
        }
        return "\(key) \(name)"
    }

    private static func whitenDiffuseIfTextured(_ block: [String]) -> [String] {
        guard block.contains(where: { $0.hasPrefix("map_Kd ") }) else { return block }
        return block.map { $0.hasPrefix("Kd ") ? "Kd 1 1 1" : $0 }
    }
}
