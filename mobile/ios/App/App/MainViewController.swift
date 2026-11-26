import UIKit
import Capacitor

/// Registers the app's own plugins (no npm package needed for them).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(QBooksUploadPlugin())
    }
}
