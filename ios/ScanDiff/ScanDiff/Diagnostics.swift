import Foundation
import UIKit

/// Breadcrumb log written to Documents/diagnostics.log (pullable over USB with
/// devicectl) plus a watchdog that records when the main thread stops responding.
/// Writes happen on a background queue, so entries still land during a main-thread hang.
enum Diagnostics {
    private static let queue = DispatchQueue(label: "com.scandiff.diagnostics", qos: .utility)
    private static let fileURL = URL.documentsDirectory.appendingPathComponent("diagnostics.log")
    private static let maxBytes = 2_000_000
    private static let lock = NSLock()
    nonisolated(unsafe) private static var lastMainPing = Date()
    nonisolated(unsafe) private static var watchdog: DispatchSourceTimer?
    nonisolated(unsafe) private static var reportedBlock = false

    static func log(_ message: String) {
        let line = "\(timestamp()) mem=\(footprintMB())MB \(message)\n"
        print(line, terminator: "")
        queue.async { append(line) }
    }

    /// Call once at launch.
    @MainActor
    static func start() {
        queue.async { trimIfNeeded() }
        log("launch \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?") on \(DeviceInfo.description)")
        let environment = ProcessInfo.processInfo.environment
        log("metal debug layer=\(environment["MTL_DEBUG_LAYER"] ?? "unset") shader validation=\(environment["MTL_SHADER_VALIDATION"] ?? "unset")")
        NSSetUncaughtExceptionHandler { exception in
            Diagnostics.logSync("UNCAUGHT EXCEPTION \(exception.name.rawValue): \(exception.reason ?? "") \(exception.callStackSymbols.prefix(8).joined(separator: " | "))")
        }
        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: nil
        ) { _ in
            Diagnostics.log("MEMORY WARNING")
        }
        Task { @MainActor in
            while true {
                pingMain()
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 1, repeating: 1)
        timer.setEventHandler { checkMainThread() }
        timer.resume()
        watchdog = timer
    }

    private static func pingMain() {
        lock.lock()
        lastMainPing = Date()
        lock.unlock()
    }

    private static func checkMainThread() {
        lock.lock()
        let stalled = Date().timeIntervalSince(lastMainPing)
        lock.unlock()
        if stalled > 2 {
            if !reportedBlock || Int(stalled) % 5 == 0 {
                append("\(timestamp()) mem=\(footprintMB())MB MAIN THREAD BLOCKED for \(String(format: "%.1f", stalled))s\n")
            }
            reportedBlock = true
        } else if reportedBlock {
            reportedBlock = false
            append("\(timestamp()) mem=\(footprintMB())MB main thread responsive again\n")
        }
    }

    private static func logSync(_ message: String) {
        let line = "\(timestamp()) mem=\(footprintMB())MB \(message)\n"
        queue.sync { append(line) }
    }

    private static func append(_ line: String) {
        guard let data = line.data(using: .utf8) else { return }
        if let handle = try? FileHandle(forWritingTo: fileURL) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
        } else {
            try? data.write(to: fileURL)
        }
    }

    private static func trimIfNeeded() {
        guard let size = try? FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as? Int,
              size > maxBytes,
              let data = try? Data(contentsOf: fileURL) else {
            return
        }
        try? data.suffix(maxBytes / 2).write(to: fileURL)
    }

    private static func timestamp() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: Date())
    }

    static func footprintMB() -> Int {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let result = withUnsafeMutablePointer(to: &info) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        guard result == KERN_SUCCESS else { return -1 }
        return Int(info.phys_footprint / 1_048_576)
    }
}
