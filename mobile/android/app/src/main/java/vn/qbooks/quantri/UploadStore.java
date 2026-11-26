package vn.qbooks.quantri;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;

/**
 * Persistent state of background video uploads (files/state.json), shared by the plugin and
 * UploadWorker. Every method is synchronized; values are plain JSON so they survive restarts.
 *
 * file: ref, path, name, type, size, duration, lastModified, state (writing|local|uploading|parts_done|complete|failed|cancelled),
 *       uploadId, partSize, parts, done[], baseUrl, token, error, created
 * job:  orderId, label, refs[], packPath, packBody, baseUrl, token, state (waiting|packing|done|failed), error
 */
final class UploadStore {
    interface Listener { void onEvent(String name, JSONObject data); }

    private static UploadStore instance;
    static volatile Listener listener;

    private final File dir;
    private JSONObject files = new JSONObject();
    private JSONObject jobs = new JSONObject();

    static synchronized UploadStore get(Context ctx) {
        if (instance == null) instance = new UploadStore(ctx.getApplicationContext());
        return instance;
    }

    private UploadStore(Context ctx) {
        dir = new File(ctx.getFilesDir(), "qbooks-uploads");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        try {
            File f = new File(dir, "state.json");
            if (f.exists()) {
                JSONObject o = new JSONObject(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
                files = o.optJSONObject("files") != null ? o.optJSONObject("files") : new JSONObject();
                jobs = o.optJSONObject("jobs") != null ? o.optJSONObject("jobs") : new JSONObject();
            }
        } catch (Exception ignored) { }
        // A job interrupted while posting /pack is retried.
        for (Iterator<String> it = jobs.keys(); it.hasNext(); ) {
            JSONObject j = jobs.optJSONObject(it.next());
            if (j != null && "packing".equals(j.optString("state"))) put(j, "state", "waiting");
        }
    }

    File dir() { return dir; }

    synchronized void save() {
        try {
            JSONObject o = new JSONObject();
            o.put("files", files);
            o.put("jobs", jobs);
            File tmp = new File(dir, "state.json.tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(o.toString().getBytes(StandardCharsets.UTF_8)); }
            //noinspection ResultOfMethodCallIgnored
            tmp.renameTo(new File(dir, "state.json"));
        } catch (Exception ignored) { }
    }

    synchronized JSONObject newFile(String ext, String name, String type, double duration) {
        String ref = UUID.randomUUID().toString();
        JSONObject f = new JSONObject();
        put(f, "ref", ref);
        put(f, "path", new File(dir, ref + "." + ext).getAbsolutePath());
        put(f, "name", name);
        put(f, "type", type);
        put(f, "size", 0L);
        put(f, "duration", duration);
        put(f, "lastModified", System.currentTimeMillis());
        put(f, "created", System.currentTimeMillis());
        put(f, "state", "writing");
        put(files, ref, f);
        save();
        return f;
    }

    synchronized JSONObject file(String ref) { return files.optJSONObject(ref); }
    synchronized JSONObject job(String orderId) { return jobs.optJSONObject(orderId); }

    synchronized List<JSONObject> filesInState(String state) {
        List<JSONObject> out = new ArrayList<>();
        for (Iterator<String> it = files.keys(); it.hasNext(); ) {
            JSONObject f = files.optJSONObject(it.next());
            if (f != null && state.equals(f.optString("state"))) out.add(f);
        }
        return out;
    }

    synchronized List<JSONObject> jobsInState(String state) {
        List<JSONObject> out = new ArrayList<>();
        for (Iterator<String> it = jobs.keys(); it.hasNext(); ) {
            JSONObject j = jobs.optJSONObject(it.next());
            if (j != null && state.equals(j.optString("state"))) out.add(j);
        }
        return out;
    }

    synchronized void putJob(JSONObject job) { put(jobs, job.optString("orderId"), job); save(); emit("job", publicJob(job)); }
    synchronized void forgetJob(String orderId) { jobs.remove(orderId); save(); }

    synchronized void setState(String ref, String state, String error) {
        JSONObject f = files.optJSONObject(ref);
        if (f == null) return;
        put(f, "state", state);
        if (error != null) put(f, "error", error); else f.remove("error");
        save();
        emitProgress(ref, 0);
    }

    synchronized void markPartDone(String ref, int n) {
        JSONObject f = files.optJSONObject(ref);
        if (f == null) return;
        JSONArray done = f.optJSONArray("done");
        if (done == null) { done = new JSONArray(); put(f, "done", done); }
        for (int i = 0; i < done.length(); i++) if (done.optInt(i) == n) return;
        done.put(n);
        save();
    }

    synchronized void removeFile(String ref) {
        JSONObject f = files.optJSONObject(ref);
        if (f != null) //noinspection ResultOfMethodCallIgnored
            new File(f.optString("path")).delete();
        files.remove(ref);
        save();
    }

    synchronized void deleteLocal(String ref) {
        JSONObject f = files.optJSONObject(ref);
        if (f != null) //noinspection ResultOfMethodCallIgnored
            new File(f.optString("path")).delete();
    }

    /** Picked/recorded videos that were never saved are removed after 3 days. */
    synchronized void cleanup() {
        long cutoff = System.currentTimeMillis() - 3L * 24 * 3600 * 1000;
        List<String> busy = new ArrayList<>();
        for (JSONObject j : jobsInState("waiting")) {
            JSONArray r = j.optJSONArray("refs");
            for (int i = 0; r != null && i < r.length(); i++) busy.add(r.optString(i));
        }
        List<String> stale = new ArrayList<>();
        for (Iterator<String> it = files.keys(); it.hasNext(); ) {
            String ref = it.next();
            JSONObject f = files.optJSONObject(ref);
            String st = f == null ? "" : f.optString("state");
            boolean idle = !"uploading".equals(st) && !"parts_done".equals(st);
            if (f != null && idle && !busy.contains(ref) && f.optLong("created") < cutoff) stale.add(ref);
        }
        for (String ref : stale) removeFile(ref);
    }

    synchronized JSONObject snapshot() {
        JSONObject outFiles = new JSONObject(), outJobs = new JSONObject();
        for (Iterator<String> it = files.keys(); it.hasNext(); ) {
            String ref = it.next();
            put(outFiles, ref, publicFile(files.optJSONObject(ref), 0));
        }
        for (Iterator<String> it = jobs.keys(); it.hasNext(); ) {
            String id = it.next();
            put(outJobs, id, publicJob(jobs.optJSONObject(id)));
        }
        JSONObject o = new JSONObject();
        put(o, "files", outFiles);
        put(o, "jobs", outJobs);
        return o;
    }

    /** Bytes confirmed by the server plus bytes of parts currently being sent. */
    synchronized long sent(JSONObject f, long inFlight) {
        long size = f.optLong("size");
        String st = f.optString("state");
        if ("complete".equals(st) || "parts_done".equals(st)) return size;
        long partSize = f.optLong("partSize"), total = 0;
        int parts = f.optInt("parts");
        JSONArray done = f.optJSONArray("done");
        for (int i = 0; done != null && i < done.length(); i++) {
            int n = done.optInt(i);
            total += n == parts ? size - (long) (n - 1) * partSize : partSize;
        }
        return Math.min(size, total + inFlight);
    }

    synchronized JSONObject publicFile(JSONObject f, long inFlight) {
        JSONObject o = new JSONObject();
        if (f == null) return o;
        for (String k : new String[]{"ref", "name", "type", "size", "duration", "lastModified", "state", "error", "uploadId"})
            if (f.has(k)) put(o, k, f.opt(k));
        put(o, "total", f.optLong("size"));
        put(o, "sent", sent(f, inFlight));
        return o;
    }

    static JSONObject publicJob(JSONObject j) {
        JSONObject o = new JSONObject();
        if (j == null) return o;
        for (String k : new String[]{"orderId", "label", "state", "error", "files"}) if (j.has(k)) put(o, k, j.opt(k));
        return o;
    }

    synchronized void emitProgress(String ref, long inFlight) {
        JSONObject f = files.optJSONObject(ref);
        if (f != null) emit("progress", publicFile(f, inFlight));
    }

    static void emit(String name, JSONObject data) {
        Listener l = listener;
        if (l != null) l.onEvent(name, data);
    }

    static void put(JSONObject o, String k, Object v) {
        try { o.put(k, v); } catch (JSONException ignored) { }
    }
}
