import Foundation
import Capacitor
import PhotosUI
import AVFoundation
import UniformTypeIdentifiers

/// JS bridge for the background video uploader (see QBooksUploader).
/// Called from https://qbooks-quantri.pages.dev through `Capacitor.nativePromise('QBooksUpload', …)`.
@objc(QBooksUploadPlugin)
public class QBooksUploadPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "QBooksUploadPlugin"
    public let jsName = "QBooksUpload"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickVideos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finalize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forgetJob", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
    ]

    private var pickCall: CAPPluginCall?
    private let uploader = QBooksUploader.shared

    override public func load() {
        uploader.emit = { [weak self] event, data in self?.notifyListeners(event, data: data, retainUntilConsumed: false) }
        uploader.activate()
    }

    // MARK: picking from the photo library

    @objc func pickVideos(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var config = PHPickerConfiguration(photoLibrary: .shared())
            config.filter = .videos
            config.selectionLimit = call.getBool("multiple", true) ? 0 : 1
            config.preferredAssetRepresentationMode = .current   // no re-encoding: much faster for long clips
            let picker = PHPickerViewController(configuration: config)
            picker.delegate = self
            self.pickCall = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pickCall else { return }
        pickCall = nil
        if results.isEmpty { return call.reject("cancelled") }
        let group = DispatchGroup()
        var files = [[String: Any]?](repeating: nil, count: results.count)
        var failure: String?
        for (i, result) in results.enumerated() {
            let provider = result.itemProvider
            let typeId = provider.registeredTypeIdentifiers.first { UTType($0)?.conforms(to: .movie) == true } ?? UTType.movie.identifier
            group.enter()
            provider.loadFileRepresentation(forTypeIdentifier: typeId) { url, error in
                defer { group.leave() }
                guard let url = url else { failure = error?.localizedDescription ?? "Không đọc được video."; return }
                // The provided URL is deleted when this callback returns: move it into the app first.
                let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "." + url.pathExtension)
                do { try FileManager.default.copyItem(at: url, to: tmp) } catch { failure = error.localizedDescription; return }
                let duration = CMTimeGetSeconds(AVURLAsset(url: tmp).duration)
                let base = provider.suggestedName ?? "VIDEO_\(Int(Date().timeIntervalSince1970))"
                let name = base.lowercased().hasSuffix("." + url.pathExtension.lowercased()) ? base : base + "." + url.pathExtension
                let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "video/mp4"
                files[i] = self.uploader.registerLocalFile(url: tmp, name: name, type: mime, duration: duration.isFinite ? duration : 0)
            }
        }
        group.notify(queue: .global()) {
            let ok = files.compactMap { $0 }
            if ok.isEmpty { return call.reject(failure ?? "Không đọc được video.") }
            call.resolve(["files": ok])
        }
    }

    // MARK: in-app recorder output (streamed from the web page)

    @objc func beginFile(_ call: CAPPluginCall) {
        call.resolve(["ref": uploader.beginFile(name: call.getString("name") ?? "QBOOKS.webm", type: call.getString("type") ?? "video/webm")])
    }

    @objc func appendFile(_ call: CAPPluginCall) {
        guard let ref = call.getString("ref"), let b64 = call.getString("data"), let data = Data(base64Encoded: b64) else {
            return call.reject("Dữ liệu video không hợp lệ.")
        }
        do { try uploader.appendFile(ref: ref, data: data); call.resolve() } catch { call.reject(error.localizedDescription) }
    }

    @objc func endFile(_ call: CAPPluginCall) {
        do { call.resolve(try uploader.endFile(ref: call.getString("ref") ?? "")) } catch { call.reject(error.localizedDescription) }
    }

    // MARK: upload control

    @objc func start(_ call: CAPPluginCall) {
        guard let ref = call.getString("ref"), let uploadId = call.getString("uploadId"),
              let base = call.getString("baseUrl"), let token = call.getString("token") else { return call.reject("Thiếu thông tin tải video.") }
        let partSize = Int64(call.getDouble("partSize") ?? 8 * 1024 * 1024)
        let skip = (call.getArray("skipParts") ?? []).compactMap { ($0 as? NSNumber)?.intValue }
        do {
            try uploader.start(ref: ref, uploadId: uploadId, partSize: partSize, skipParts: skip,
                               alreadyComplete: call.getBool("alreadyComplete", false), baseUrl: base, token: token)
            call.resolve()
        } catch { call.reject(error.localizedDescription) }
    }

    @objc func finalize(_ call: CAPPluginCall) {
        guard let orderId = call.getString("orderId"), let packPath = call.getString("packPath"),
              let base = call.getString("baseUrl"), let token = call.getString("token") else { return call.reject("Thiếu thông tin lưu đơn.") }
        let refs = (call.getArray("refs") ?? []).compactMap { $0 as? String }
        uploader.finalize(orderId: orderId, label: call.getString("label") ?? orderId, refs: refs, packPath: packPath,
                          packBody: call.getString("packBody") ?? "{}", baseUrl: base, token: token)
        call.resolve()
    }

    @objc func cancel(_ call: CAPPluginCall) {
        if let ref = call.getString("ref") { uploader.cancel(ref: ref) }
        call.resolve()
    }

    @objc func forgetJob(_ call: CAPPluginCall) {
        if let id = call.getString("orderId") { uploader.forgetJob(orderId: id) }
        call.resolve()
    }

    @objc func getState(_ call: CAPPluginCall) {
        call.resolve(uploader.state())
    }
}
