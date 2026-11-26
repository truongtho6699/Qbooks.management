package vn.qbooks.quantri;

import android.Manifest;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** JS bridge for background video uploads (see UploadWorker / UploadStore). */
@CapacitorPlugin(
        name = "QBooksUpload",
        permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class QBooksUploadPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private UploadStore store;

    @Override
    public void load() {
        store = UploadStore.get(getContext());
        UploadStore.listener = (name, data) -> {
            try { notifyListeners(name, JSObject.fromJSONObject(data)); } catch (JSONException ignored) { }
        };
        // Resume anything left unfinished (app was killed, phone restarted, network was down).
        if (!store.filesInState("uploading").isEmpty() || !store.filesInState("parts_done").isEmpty() || !store.jobsInState("waiting").isEmpty())
            UploadWorker.enqueue(getContext());
        io.execute(store::cleanup);
    }

    // ---- picking --------------------------------------------------------------------------------

    @PluginMethod
    public void pickVideos(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.setType("video/*");
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", true));
        startActivityForResult(call, Intent.createChooser(i, "Chọn video đóng hàng"), "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        if (call == null) return;
        if (data == null) { call.reject("cancelled"); return; }
        List<Uri> uris = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
        else if (data.getData() != null) uris.add(data.getData());
        if (uris.isEmpty()) { call.reject("cancelled"); return; }
        io.execute(() -> {
            JSArray files = new JSArray();
            String failure = null;
            for (Uri uri : uris) {
                try { files.put(copyIn(uri)); } catch (Exception e) { failure = e.getMessage(); }
            }
            if (files.length() == 0) { call.reject(failure != null ? failure : "Không đọc được video."); return; }
            JSObject out = new JSObject();
            out.put("files", files);
            call.resolve(out);
        });
    }

    /** Copies the picked video into app storage so it stays readable while uploading in the background. */
    private JSONObject copyIn(Uri uri) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        String name = "VIDEO_" + System.currentTimeMillis() + ".mp4";
        try (Cursor c = cr.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) name = c.getString(0);
        }
        String type = cr.getType(uri);
        if (type == null) type = "video/mp4";
        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(type);
        if (name.contains(".")) ext = name.substring(name.lastIndexOf('.') + 1);
        if (ext == null || ext.isEmpty()) ext = "mp4";
        JSONObject f = store.newFile(ext, name, type, 0);
        String ref = f.getString("ref");
        File dest = new File(f.getString("path"));
        try (InputStream in = cr.openInputStream(uri); OutputStream out = new FileOutputStream(dest)) {
            if (in == null) throw new Exception("Không mở được video.");
            byte[] buf = new byte[1024 * 1024];
            int r;
            while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
        } catch (Exception e) {
            store.removeFile(ref);
            throw e;
        }
        finishFile(ref, dest);
        return store.publicFile(store.file(ref), 0);
    }

    private void finishFile(String ref, File file) {
        double seconds = 0;
        MediaMetadataRetriever mmr = new MediaMetadataRetriever();
        try {
            mmr.setDataSource(file.getAbsolutePath());
            String ms = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if (ms != null) seconds = Long.parseLong(ms) / 1000.0;
        } catch (Exception ignored) {
        } finally {
            try { mmr.release(); } catch (Exception ignored) { }
        }
        JSONObject f = store.file(ref);
        synchronized (store) {
            UploadStore.put(f, "size", file.length());
            UploadStore.put(f, "duration", seconds);
            UploadStore.put(f, "state", "local");
            store.save();
        }
    }

    // ---- in-app recorder output (streamed from the page) ----------------------------------------

    @PluginMethod
    public void beginFile(PluginCall call) {
        String type = call.getString("type", "video/webm");
        JSONObject f = store.newFile(type.contains("mp4") ? "mp4" : "webm", call.getString("name", "QBOOKS.webm"), type, 0);
        JSObject out = new JSObject();
        out.put("ref", f.optString("ref"));
        call.resolve(out);
    }

    @PluginMethod
    public void appendFile(PluginCall call) {
        String ref = call.getString("ref"), data = call.getString("data");
        JSONObject f = ref == null ? null : store.file(ref);
        if (f == null || data == null) { call.reject("Không tìm thấy tệp quay."); return; }
        io.execute(() -> {
            try (FileOutputStream out = new FileOutputStream(f.optString("path"), true)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
                call.resolve();
            } catch (Exception e) {
                call.reject("Không ghi được video: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void endFile(PluginCall call) {
        String ref = call.getString("ref");
        io.execute(() -> {
            JSONObject f = ref == null ? null : store.file(ref);
            if (f == null) { call.reject("Không tìm thấy tệp quay."); return; }
            File file = new File(f.optString("path"));
            if (file.length() == 0) { call.reject("Video quay rỗng."); return; }
            finishFile(ref, file);
            try { call.resolve(JSObject.fromJSONObject(store.publicFile(store.file(ref), 0))); }
            catch (JSONException e) { call.reject(e.getMessage()); }
        });
    }

    // ---- upload control -------------------------------------------------------------------------

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            // Ask once so the progress / "đã lưu" notifications are visible; the upload runs either way.
            requestPermissionForAlias("notifications", call, "afterNotificationPermission");
            return;
        }
        doStart(call);
    }

    @PermissionCallback
    private void afterNotificationPermission(PluginCall call) { doStart(call); }

    private void doStart(PluginCall call) {
        String ref = call.getString("ref"), uploadId = call.getString("uploadId");
        JSONObject f = ref == null ? null : store.file(ref);
        if (f == null || uploadId == null) { call.reject("Tệp video không còn trong app, hãy chọn lại."); return; }
        synchronized (store) {
            String st = f.optString("state");
            boolean running = uploadId.equals(f.optString("uploadId")) && (st.equals("uploading") || st.equals("parts_done") || st.equals("complete"));
            UploadStore.put(f, "token", call.getString("token"));
            if (!running) {
                long partSize = (long) (double) call.getDouble("partSize", 8.0 * 1024 * 1024);
                long size = f.optLong("size");
                UploadStore.put(f, "uploadId", uploadId);
                UploadStore.put(f, "partSize", partSize);
                UploadStore.put(f, "parts", (int) ((size + partSize - 1) / partSize));
                UploadStore.put(f, "baseUrl", call.getString("baseUrl"));
                JSONArray skip = call.getArray("skipParts", new JSArray());
                UploadStore.put(f, "done", skip);
                f.remove("error");
                UploadStore.put(f, "state", Boolean.TRUE.equals(call.getBoolean("alreadyComplete", false)) ? "complete" : "uploading");
            }
            store.save();
        }
        store.emitProgress(ref, 0);
        UploadWorker.enqueue(getContext());
        call.resolve();
    }

    @PluginMethod
    public void finalize(PluginCall call) {
        String orderId = call.getString("orderId");
        if (orderId == null) { call.reject("Thiếu mã đơn."); return; }
        JSONObject job = new JSONObject();
        UploadStore.put(job, "orderId", orderId);
        UploadStore.put(job, "label", call.getString("label", orderId));
        UploadStore.put(job, "refs", call.getArray("refs", new JSArray()));
        UploadStore.put(job, "packPath", call.getString("packPath"));
        UploadStore.put(job, "packBody", call.getString("packBody", "{}"));
        UploadStore.put(job, "baseUrl", call.getString("baseUrl"));
        UploadStore.put(job, "token", call.getString("token"));
        UploadStore.put(job, "state", "waiting");
        store.putJob(job);
        UploadWorker.enqueue(getContext());
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String ref = call.getString("ref");
        if (ref != null && store.file(ref) != null) {
            store.setState(ref, "cancelled", null);
            store.deleteLocal(ref);
        }
        call.resolve();
    }

    @PluginMethod
    public void forgetJob(PluginCall call) {
        String id = call.getString("orderId");
        if (id != null) store.forgetJob(id);
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        try { call.resolve(JSObject.fromJSONObject(store.snapshot())); }
        catch (JSONException e) { call.reject(e.getMessage()); }
    }
}
