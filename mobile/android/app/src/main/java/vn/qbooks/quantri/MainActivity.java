package vn.qbooks.quantri;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(QBooksUploadPlugin.class); // background video uploads (screen off / app in background)
        super.onCreate(savedInstanceState);
    }
}
