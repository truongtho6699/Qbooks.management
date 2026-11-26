import Foundation
import UIKit
import UserNotifications

/// Background uploader for packing videos.
///
/// Every R2 part of a video is written to its own file and handed to a *background* URLSession,
/// so iOS keeps sending them while the screen is off or the app is suspended (even after the
/// system terminates the app). When the last part of a file finishes the app is woken up, calls
/// `/complete`, and when all videos of an order are done it posts the packing record (`/pack`).
/// State is persisted in `state.json` so a relaunched app picks up where it left off.
final class QBooksUploader: NSObject, URLSessionDataDelegate {
    static let shared = QBooksUploader()
    static let sessionIdentifier = "vn.qbooks.quantri.background-upload"

    /// Set by the plugin to forward events to the web page.
    var emit: ((String, [String: Any]) -> Void)?
    /// Completion handler iOS gives us when it relaunches the app for session events.
    var backgroundCompletion: (() -> Void)?

    private let queue: OperationQueue = {
        let q = OperationQueue()
        q.maxConcurrentOperationCount = 1
        q.name = "qbooks.upload"
        return q
    }()
    private var files: [String: [String: Any]] = [:]
    private var jobs: [String: [String: Any]] = [:]
    private var responses: [Int: Data] = [:]
    private var inFlight: [String: Int64] = [:]   // "ref|n" -> bytes sent of a running part
    private var lastEmit: [String: Date] = [:]

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: QBooksUploader.sessionIdentifier)
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.httpMaximumConnectionsPerHost = 3
        config.timeoutIntervalForResource = 7 * 24 * 3600
        return URLSession(configuration: config, delegate: self, delegateQueue: queue)
    }()

    // MARK: storage

    static var rootDir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("QBooksUploads", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        var d = dir; try? d.setResourceValues(values)
        return dir
    }
    private static var partsDir: URL {
        let dir = rootDir.appendingPathComponent("parts", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
    private static var stateURL: URL { rootDir.appendingPathComponent("state.json") }

    private override init() {
        super.init()
        if let data = try? Data(contentsOf: QBooksUploader.stateURL),
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            files = obj["files"] as? [String: [String: Any]] ?? [:]
            jobs = obj["jobs"] as? [String: [String: Any]] ?? [:]
        }
    }

    /// Reconnects to the background session (call at launch) and resumes unfinished work.
    func activate() {
        queue.addOperation {
            _ = self.session
            self.session.getAllTasks { tasks in
                self.queue.addOperation { self.resumeAfterLaunch(running: tasks) }
            }
            self.cleanupOldFiles()
        }
    }

    private func save() {
        let obj: [String: Any] = ["files": files, "jobs": jobs]
        if let data = try? JSONSerialization.data(withJSONObject: obj) {
            try? data.write(to: QBooksUploader.stateURL, options: .atomic)
        }
    }

    // MARK: local files

    func registerLocalFile(url: URL, name: String, type: String, duration: Double) -> [String: Any] {
        let ref = UUID().uuidString
        let ext = url.pathExtension.isEmpty ? "mp4" : url.pathExtension
        let dest = QBooksUploader.rootDir.appendingPathComponent(ref + "." + ext)
        try? FileManager.default.removeItem(at: dest)
        do { try FileManager.default.moveItem(at: url, to: dest) } catch { try? FileManager.default.copyItem(at: url, to: dest) }
        let size = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? NSNumber)?.int64Value ?? 0
        let entry: [String: Any] = [
            "ref": ref, "path": dest.path, "name": name, "type": type, "size": size,
            "duration": duration, "lastModified": Int64(Date().timeIntervalSince1970 * 1000),
            "state": "local", "sent": 0, "total": size, "created": Date().timeIntervalSince1970,
        ]
        return sync { self.files[ref] = entry; self.save(); return self.publicFile(entry) }
    }

    func beginFile(name: String, type: String) -> String {
        let ref = UUID().uuidString
        let ext = type.contains("mp4") ? "mp4" : "webm"
        let dest = QBooksUploader.rootDir.appendingPathComponent(ref + "." + ext)
        FileManager.default.createFile(atPath: dest.path, contents: nil)
        sync {
            self.files[ref] = ["ref": ref, "path": dest.path, "name": name, "type": type, "size": 0, "duration": 0,
                               "lastModified": Int64(Date().timeIntervalSince1970 * 1000), "state": "writing",
                               "sent": 0, "total": 0, "created": Date().timeIntervalSince1970]
            self.save()
        }
        return ref
    }

    func appendFile(ref: String, data: Data) throws {
        guard let path = sync({ self.files[ref]?["path"] as? String }) else { throw err("Không tìm thấy tệp quay.") }
        let handle = try FileHandle(forWritingTo: URL(fileURLWithPath: path))
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: data)
    }

    func endFile(ref: String) throws -> [String: Any] {
        return try syncThrowing {
            guard var f = self.files[ref], let path = f["path"] as? String else { throw self.err("Không tìm thấy tệp quay.") }
            let size = (try? FileManager.default.attributesOfItem(atPath: path)[.size] as? NSNumber)?.int64Value ?? 0
            if size == 0 { throw self.err("Video quay rỗng.") }
            f["size"] = size; f["total"] = size; f["state"] = "local"
            self.files[ref] = f; self.save()
            return self.publicFile(f)
        }
    }

    // MARK: commands from the web page

    func start(ref: String, uploadId: String, partSize: Int64, skipParts: [Int], alreadyComplete: Bool,
               baseUrl: String, token: String) throws {
        try syncThrowing {
            guard var f = self.files[ref] else { throw self.err("Tệp video không còn trong app, hãy chọn lại.") }
            let state = f["state"] as? String ?? ""
            if f["uploadId"] as? String == uploadId, ["uploading", "parts_done", "complete"].contains(state) {
                f["token"] = token; self.files[ref] = f; self.save()   // already running: refresh the token only
                return
            }
            let size = (f["size"] as? NSNumber)?.int64Value ?? 0
            let parts = Int((size + partSize - 1) / partSize)
            f["uploadId"] = uploadId; f["partSize"] = partSize; f["parts"] = parts
            f["done"] = skipParts; f["baseUrl"] = baseUrl; f["token"] = token; f["error"] = nil; f["retries"] = [String: Int]()
            f["state"] = alreadyComplete ? "complete" : "uploading"
            self.files[ref] = f; self.save()
            if alreadyComplete { self.emitProgress(ref, force: true); self.checkJobs(); return }
            self.enqueueParts(ref)
        }
    }

    func finalize(orderId: String, label: String, refs: [String], packPath: String, packBody: String,
                  baseUrl: String, token: String) {
        requestNotificationPermission()
        sync {
            self.jobs[orderId] = ["orderId": orderId, "label": label, "refs": refs, "packPath": packPath,
                                  "packBody": packBody, "baseUrl": baseUrl, "token": token, "state": "waiting"]
            self.save()
            self.emitJob(orderId)
            self.checkJobs()
        }
    }

    func cancel(ref: String) {
        session.getAllTasks { tasks in
            for t in tasks where (t.taskDescription ?? "").hasPrefix(ref + "|") { t.cancel() }
            self.queue.addOperation {
                if var f = self.files[ref] {
                    f["state"] = "cancelled"; self.files[ref] = f
                    self.emitProgress(ref, force: true)
                    self.deleteLocal(ref)
                }
            }
        }
    }

    func forgetJob(orderId: String) { sync { self.jobs[orderId] = nil; self.save() } }

    func state() -> [String: Any] {
        return sync {
            var out: [String: Any] = [:]
            for (k, v) in self.files { out[k] = self.publicFile(v) }
            var js: [String: Any] = [:]
            for (k, v) in self.jobs { js[k] = self.publicJob(v) }
            return ["files": out, "jobs": js]
        }
    }

    // MARK: parts

    private func partURL(_ ref: String, _ n: Int) -> URL { QBooksUploader.partsDir.appendingPathComponent("\(ref)_\(n).part") }

    private func enqueueParts(_ ref: String) {
        guard let f = files[ref], let path = f["path"] as? String, let uploadId = f["uploadId"] as? String,
              let partSize = (f["partSize"] as? NSNumber)?.int64Value, let parts = f["parts"] as? Int else { return }
        let done = Set(f["done"] as? [Int] ?? [])
        guard let reader = FileHandle(forReadingAtPath: path) else { return fail(ref, "Không đọc được tệp video trong app.") }
        defer { try? reader.close() }
        session.getAllTasks { running in
            let active = Set(running.compactMap { $0.taskDescription })
            self.queue.addOperation {
                for n in 1...max(parts, 1) where !done.contains(n) && !active.contains("\(ref)|\(n)") {
                    let url = self.partURL(ref, n)
                    if !FileManager.default.fileExists(atPath: url.path) {
                        guard let h = FileHandle(forReadingAtPath: path) else { return self.fail(ref, "Không đọc được tệp video trong app.") }
                        try? h.seek(toOffset: UInt64(Int64(n - 1) * partSize))
                        let chunk = (try? h.read(upToCount: Int(partSize))) ?? Data()
                        try? h.close()
                        do { try chunk.write(to: url) } catch { return self.fail(ref, "Máy hết dung lượng trống để chuẩn bị tải video.") }
                    }
                    self.submitPart(ref: ref, n: n, uploadId: uploadId)
                }
                self.emitProgress(ref, force: true)
                if parts == 0 || Set(self.files[ref]?["done"] as? [Int] ?? []).count >= parts { self.partsFinished(ref) }
            }
        }
    }

    private func submitPart(ref: String, n: Int, uploadId: String) {
        guard let f = files[ref], let base = f["baseUrl"] as? String, let token = f["token"] as? String,
              let url = URL(string: base + "/api/uploads/" + uploadId + "/parts/\(n)") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        req.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        let task = session.uploadTask(with: req, fromFile: partURL(ref, n))
        task.taskDescription = "\(ref)|\(n)"
        task.resume()
    }

    private func resumeAfterLaunch(running: [URLSessionTask]) {
        for (id, j) in jobs where j["state"] as? String == "packing" { var j = j; j["state"] = "waiting"; jobs[id] = j }
        let active = Set(running.compactMap { $0.taskDescription?.split(separator: "|").first.map(String.init) })
        for (ref, f) in files {
            switch f["state"] as? String {
            case "uploading": if !active.contains(ref) { enqueueParts(ref) }
            case "parts_done": partsFinished(ref)
            default: break
            }
        }
        checkJobs()
    }

    // MARK: URLSession delegate

    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
                    totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard let desc = task.taskDescription else { return }
        inFlight[desc] = totalBytesSent
        if let ref = desc.split(separator: "|").first { emitProgress(String(ref)) }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        responses[dataTask.taskIdentifier, default: Data()].append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let body = responses.removeValue(forKey: task.taskIdentifier) ?? Data()
        guard let desc = task.taskDescription else { return }
        inFlight[desc] = nil
        let pieces = desc.split(separator: "|")
        guard pieces.count == 2, let n = Int(pieces[1]) else { return }
        let ref = String(pieces[0])
        guard var f = files[ref], f["state"] as? String == "uploading" else { return }
        let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
        if error == nil, (200..<300).contains(status) {
            var done = f["done"] as? [Int] ?? []
            if !done.contains(n) { done.append(n) }
            f["done"] = done; files[ref] = f; save()
            try? FileManager.default.removeItem(at: partURL(ref, n))
            emitProgress(ref, force: true)
            if done.count >= (f["parts"] as? Int ?? 0) { partsFinished(ref) }
            return
        }
        if (error as NSError?)?.code == NSURLErrorCancelled { return }
        if status == 401 { return fail(ref, "Phiên đăng nhập đã hết hạn. Mở app, đăng nhập lại rồi bấm LƯU để tải tiếp.") }
        var retries = f["retries"] as? [String: Int] ?? [:]
        let count = (retries["\(n)"] ?? 0) + 1
        retries["\(n)"] = count; f["retries"] = retries; files[ref] = f; save()
        if count > 8 {
            let message = serverMessage(body) ?? error?.localizedDescription ?? "HTTP \(status)"
            return fail(ref, "Tải video gián đoạn ở phần \(n): \(message)")
        }
        if let uploadId = f["uploadId"] as? String { submitPart(ref: ref, n: n, uploadId: uploadId) }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            self.backgroundCompletion?()
            self.backgroundCompletion = nil
        }
    }

    // MARK: complete + pack (short requests, run with background time)

    private func partsFinished(_ ref: String) {
        guard var f = files[ref], let uploadId = f["uploadId"] as? String,
              let base = f["baseUrl"] as? String, let token = f["token"] as? String else { return }
        f["state"] = "parts_done"; files[ref] = f; save()
        post(base + "/api/uploads/" + uploadId + "/complete", token: token, body: "{}") { status, body in
            guard var f = self.files[ref] else { return }
            let message = self.serverMessage(body) ?? ""
            if (200..<300).contains(status) || message.contains("đã hoàn tất") {
                f["state"] = "complete"; self.files[ref] = f; self.save()
                self.emitProgress(ref, force: true)
                self.checkJobs()
            } else if status == 0 {
                // Offline: keep "parts_done"; retried on next launch or the next finished task.
                self.emitProgress(ref, force: true)
            } else {
                self.fail(ref, "Không xác nhận được video: " + (message.isEmpty ? "HTTP \(status)" : message))
            }
        }
    }

    private func checkJobs() {
        for (orderId, job) in jobs where job["state"] as? String == "waiting" {
            let refs = job["refs"] as? [String] ?? []
            let states = refs.map { files[$0]?["state"] as? String ?? "missing" }
            if let bad = refs.first(where: { ["failed", "cancelled", "missing"].contains(files[$0]?["state"] as? String ?? "missing") }) {
                var j = job; j["state"] = "failed"
                j["error"] = files[bad]?["error"] as? String ?? "Video không còn trong app."
                jobs[orderId] = j; save(); emitJob(orderId); notify(j)
                continue
            }
            guard states.allSatisfy({ $0 == "complete" }) else { continue }
            var j = job; j["state"] = "packing"; jobs[orderId] = j; save(); emitJob(orderId)
            let base = job["baseUrl"] as? String ?? "", token = job["token"] as? String ?? ""
            post(base + (job["packPath"] as? String ?? ""), token: token, body: job["packBody"] as? String ?? "{}") { status, body in
                guard var j = self.jobs[orderId] else { return }
                if (200..<300).contains(status) {
                    j["state"] = "done"; j["files"] = refs.count
                    for r in refs { self.deleteLocal(r); self.files[r] = nil }
                } else if status == 0 {
                    j["state"] = "waiting"   // offline: try again later
                } else {
                    j["state"] = "failed"; j["error"] = self.serverMessage(body) ?? "HTTP \(status)"
                }
                self.jobs[orderId] = j; self.save(); self.emitJob(orderId)
                if j["state"] as? String != "waiting" { self.notify(j) }
            }
        }
    }

    private func post(_ urlString: String, token: String, body: String, done: @escaping (Int, Data) -> Void) {
        guard let url = URL(string: urlString) else { return done(0, Data()) }
        var req = URLRequest(url: url, timeoutInterval: 60)
        req.httpMethod = "POST"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body.data(using: .utf8)
        // beginBackgroundTask is safe off the main thread; it gives ~30 s to finish when the app was woken in the background.
        let bg = UIApplication.shared.beginBackgroundTask(withName: "qbooks.finish", expirationHandler: nil)
        URLSession.shared.dataTask(with: req) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            self.queue.addOperation {
                done(status, data ?? Data())
                DispatchQueue.main.async { UIApplication.shared.endBackgroundTask(bg) }
            }
        }.resume()
    }

    // MARK: helpers

    private func fail(_ ref: String, _ message: String) {
        guard var f = files[ref] else { return }
        f["state"] = "failed"; f["error"] = message; files[ref] = f; save()
        emitProgress(ref, force: true)
        checkJobs()
    }

    private func deleteLocal(_ ref: String) {
        if let path = files[ref]?["path"] as? String { try? FileManager.default.removeItem(atPath: path) }
        if let items = try? FileManager.default.contentsOfDirectory(at: QBooksUploader.partsDir, includingPropertiesForKeys: nil) {
            for u in items where u.lastPathComponent.hasPrefix(ref + "_") { try? FileManager.default.removeItem(at: u) }
        }
    }

    /// Videos picked but never saved (app closed, order abandoned) are removed after 3 days.
    private func cleanupOldFiles() {
        let cutoff = Date().timeIntervalSince1970 - 3 * 24 * 3600
        let busy = Set(jobs.values.flatMap { ($0["refs"] as? [String]) ?? [] })
        for (ref, f) in files where !busy.contains(ref) {
            let state = f["state"] as? String ?? ""
            if ["cancelled", "failed", "local", "writing", "complete"].contains(state), (f["created"] as? Double ?? 0) < cutoff {
                deleteLocal(ref); files[ref] = nil
            }
        }
        save()
    }

    private func serverMessage(_ data: Data) -> String? {
        (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
    }

    private func sent(_ ref: String) -> Int64 {
        guard let f = files[ref] else { return 0 }
        let size = (f["size"] as? NSNumber)?.int64Value ?? 0
        if ["complete", "parts_done"].contains(f["state"] as? String ?? "") { return size }
        let partSize = (f["partSize"] as? NSNumber)?.int64Value ?? 0, parts = f["parts"] as? Int ?? 0
        var total: Int64 = 0
        for n in f["done"] as? [Int] ?? [] { total += n == parts ? size - Int64(n - 1) * partSize : partSize }
        for (k, v) in inFlight where k.hasPrefix(ref + "|") { total += v }
        return min(total, size)
    }

    private func publicFile(_ f: [String: Any]) -> [String: Any] {
        var out: [String: Any] = [:]
        for k in ["ref", "name", "type", "size", "duration", "lastModified", "state", "error", "uploadId"] { if let v = f[k] { out[k] = v } }
        out["total"] = f["size"] ?? 0
        if let ref = f["ref"] as? String { out["sent"] = sent(ref) }
        return out
    }

    private func publicJob(_ j: [String: Any]) -> [String: Any] {
        var out: [String: Any] = [:]
        for k in ["orderId", "label", "state", "error", "files"] { if let v = j[k] { out[k] = v } }
        return out
    }

    private func emitProgress(_ ref: String, force: Bool = false) {
        let now = Date()
        if !force, let last = lastEmit[ref], now.timeIntervalSince(last) < 0.4 { return }
        lastEmit[ref] = now
        guard let f = files[ref] else { return }
        emit?("progress", publicFile(f))
    }

    private func emitJob(_ orderId: String) {
        guard let j = jobs[orderId] else { return }
        emit?("job", publicJob(j))
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    private func notify(_ job: [String: Any]) {
        let content = UNMutableNotificationContent()
        let label = job["label"] as? String ?? ""
        if job["state"] as? String == "done" {
            content.title = "Đã lưu đóng hàng " + label
            content.body = "Video đã tải xong và đơn đã được lưu."
        } else {
            content.title = "Chưa lưu được đơn " + label
            content.body = (job["error"] as? String ?? "Mở app để thử lại.")
        }
        content.sound = .default
        let req = UNNotificationRequest(identifier: "qbooks-" + (job["orderId"] as? String ?? UUID().uuidString), content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req)
    }

    private func err(_ message: String) -> NSError {
        NSError(domain: "QBooksUpload", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    /// Runs `block` on the uploader queue and waits for its result.
    @discardableResult
    private func sync<T>(_ block: @escaping () -> T) -> T {
        if OperationQueue.current == queue { return block() }
        var result: T!
        queue.addOperations([BlockOperation { result = block() }], waitUntilFinished: true)
        return result
    }

    private func syncThrowing<T>(_ block: @escaping () throws -> T) throws -> T {
        if OperationQueue.current == queue { return try block() }
        var result: Result<T, Error>!
        queue.addOperations([BlockOperation { result = Result { try block() } }], waitUntilFinished: true)
        return try result.get()
    }
}
