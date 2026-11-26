package vn.qbooks.quantri;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.ForegroundInfo;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Sends packing videos to R2 (3 parts at a time), calls /complete and posts /pack, running as a
 * foreground service ("dataSync") so it continues with the screen off or the app in the background.
 * WorkManager restarts it after reboot/process death and when the network comes back.
 */
public class UploadWorker extends Worker {
    private static final String WORK = "qbooks-upload";
    private static final String CHANNEL = "qbooks-upload";
    private static final int NOTIF_PROGRESS = 7101;
    private static final int CONCURRENCY = 3;

    /** Network problem: let WorkManager retry later instead of failing the upload. */
    private static class RetryLater extends Exception { RetryLater(String m) { super(m); } }
    /** Permanent problem for this file (HTTP 4xx, missing file…). */
    private static class Fatal extends Exception { Fatal(String m) { super(m); } }

    public UploadWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }

    static void enqueue(Context ctx) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(UploadWorker.class)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.LINEAR, 20, TimeUnit.SECONDS)
                .build();
        WorkManager.getInstance(ctx).enqueueUniqueWork(WORK, ExistingWorkPolicy.APPEND_OR_REPLACE, req);
    }

    @NonNull
    @Override
    public Result doWork() {
        UploadStore store = UploadStore.get(getApplicationContext());
        try { setForegroundAsync(foregroundInfo("Đang tải video đóng hàng…", 0)).get(); } catch (Exception ignored) { }
        try {
            for (int round = 0; round < 1000 && !isStopped(); round++) {
                boolean worked = false;
                for (JSONObject f : store.filesInState("uploading")) { worked = true; uploadFile(store, f); }
                for (JSONObject f : store.filesInState("parts_done")) { worked = true; complete(store, f); }
                worked |= checkJobs(store);
                if (!worked) break;
            }
            store.cleanup();
            return Result.success();
        } catch (RetryLater e) {
            return Result.retry();
        }
    }

    // ---- parts --------------------------------------------------------------------------------

    private void uploadFile(UploadStore store, JSONObject f) throws RetryLater {
        final String ref = f.optString("ref");
        final long size = f.optLong("size"), partSize = f.optLong("partSize");
        final int parts = f.optInt("parts");
        final Set<Integer> done = new HashSet<>();
        JSONArray d = f.optJSONArray("done");
        for (int i = 0; d != null && i < d.length(); i++) done.add(d.optInt(i));
        final ConcurrentLinkedQueue<Integer> queue = new ConcurrentLinkedQueue<>();
        for (int n = 1; n <= parts; n++) if (!done.contains(n)) queue.add(n);
        final AtomicLong inFlight = new AtomicLong();
        final AtomicReference<Exception> problem = new AtomicReference<>();
        final String url = f.optString("baseUrl") + "/api/uploads/" + f.optString("uploadId") + "/parts/";
        final String token = f.optString("token"), path = f.optString("path");
        final long[] lastEmit = {0};

        ExecutorService pool = Executors.newFixedThreadPool(CONCURRENCY);
        for (int t = 0; t < CONCURRENCY; t++) {
            pool.execute(() -> {
                Integer n;
                while (problem.get() == null && !isStopped() && (n = queue.poll()) != null) {
                    if (!"uploading".equals(store.file(ref) == null ? "" : store.file(ref).optString("state"))) return; // cancelled
                    long start = (long) (n - 1) * partSize, len = Math.min(partSize, size - start);
                    int attempt = 0;
                    while (true) {
                        long[] sentHere = {0};
                        try {
                            putPart(url + n, token, path, start, len, bytes -> {
                                sentHere[0] += bytes;
                                inFlight.addAndGet(bytes);
                                long now = System.currentTimeMillis();
                                synchronized (lastEmit) {
                                    if (now - lastEmit[0] > 400) { lastEmit[0] = now; progress(store, ref, inFlight.get()); }
                                }
                            });
                            inFlight.addAndGet(-sentHere[0]);
                            store.markPartDone(ref, n);
                            progress(store, ref, inFlight.get());
                            break;
                        } catch (Fatal e) {
                            inFlight.addAndGet(-sentHere[0]);
                            problem.compareAndSet(null, e);
                            return;
                        } catch (IOException e) {
                            inFlight.addAndGet(-sentHere[0]);
                            if (++attempt >= 5) { problem.compareAndSet(null, new RetryLater(e.getMessage())); return; }
                            try { Thread.sleep(1500L * attempt); } catch (InterruptedException ie) { return; }
                        }
                    }
                }
            });
        }
        pool.shutdown();
        try { pool.awaitTermination(7, TimeUnit.DAYS); } catch (InterruptedException ignored) { }

        Exception p = problem.get();
        if (p instanceof RetryLater) throw (RetryLater) p;
        if (p instanceof Fatal) { store.setState(ref, "failed", p.getMessage()); return; }
        JSONObject now = store.file(ref);
        if (now == null || !"uploading".equals(now.optString("state"))) return;
        JSONArray doneNow = now.optJSONArray("done");
        if (doneNow != null && doneNow.length() >= parts) store.setState(ref, "parts_done", null);
        else if (isStopped()) throw new RetryLater("stopped");
    }

    private interface Sent { void bytes(long n); }

    private void putPart(String url, String token, String path, long start, long len, Sent sent) throws IOException, Fatal {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setRequestMethod("PUT");
            c.setDoOutput(true);
            c.setConnectTimeout(30000);
            c.setReadTimeout(180000);
            c.setFixedLengthStreamingMode(len);
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Content-Type", "application/octet-stream");
            try (RandomAccessFile in = new RandomAccessFile(path, "r"); OutputStream out = c.getOutputStream()) {
                in.seek(start);
                byte[] buf = new byte[256 * 1024];
                long left = len;
                while (left > 0) {
                    int r = in.read(buf, 0, (int) Math.min(buf.length, left));
                    if (r < 0) throw new Fatal("Tệp video trong app bị thiếu dữ liệu.");
                    out.write(buf, 0, r);
                    left -= r;
                    sent.bytes(r);
                }
            }
            int code = c.getResponseCode();
            if (code >= 200 && code < 300) return;
            String msg = serverMessage(c);
            if (code == 401) throw new Fatal("Phiên đăng nhập đã hết hạn. Mở app, đăng nhập lại rồi bấm LƯU để tải tiếp.");
            if (code >= 500 || code == 429) throw new IOException("HTTP " + code + " " + msg);
            throw new Fatal("Máy chủ từ chối phần video: " + (msg.isEmpty() ? "HTTP " + code : msg));
        } catch (java.io.FileNotFoundException e) {
            throw new Fatal("Tệp video không còn trong app, hãy chọn lại.");
        } finally {
            c.disconnect();
        }
    }

    // ---- complete + pack ------------------------------------------------------------------------

    private void complete(UploadStore store, JSONObject f) throws RetryLater {
        String ref = f.optString("ref");
        String[] res = post(f.optString("baseUrl") + "/api/uploads/" + f.optString("uploadId") + "/complete", f.optString("token"), "{}");
        int code = Integer.parseInt(res[0]);
        if ((code >= 200 && code < 300) || res[1].contains("đã hoàn tất")) {
            store.setState(ref, "complete", null);
        } else {
            store.setState(ref, "failed", "Không xác nhận được video: " + (res[1].isEmpty() ? "HTTP " + code : res[1]));
        }
    }

    private boolean checkJobs(UploadStore store) throws RetryLater {
        boolean worked = false;
        for (JSONObject job : store.jobsInState("waiting")) {
            JSONArray refs = job.optJSONArray("refs");
            List<String> list = new ArrayList<>();
            for (int i = 0; refs != null && i < refs.length(); i++) list.add(refs.optString(i));
            String failure = null;
            boolean ready = true;
            for (String r : list) {
                JSONObject f = store.file(r);
                String st = f == null ? "missing" : f.optString("state");
                if ("failed".equals(st) || "cancelled".equals(st) || "missing".equals(st)) {
                    failure = f != null && f.has("error") ? f.optString("error") : "Video không còn trong app.";
                    break;
                }
                if (!"complete".equals(st)) ready = false;
            }
            String id = job.optString("orderId"), label = job.optString("label", id);
            if (failure != null) {
                UploadStore.put(job, "state", "failed");
                UploadStore.put(job, "error", failure);
                store.putJob(job);
                notifyDone(id, "Chưa lưu được đơn " + label, failure);
                continue;
            }
            if (!ready) continue;
            worked = true;
            UploadStore.put(job, "state", "packing");
            store.putJob(job);
            String[] res;
            try {
                res = post(job.optString("baseUrl") + job.optString("packPath"), job.optString("token"), job.optString("packBody", "{}"));
            } catch (RetryLater e) {
                UploadStore.put(job, "state", "waiting");
                store.putJob(job);
                throw e;
            }
            int code = Integer.parseInt(res[0]);
            if (code >= 200 && code < 300) {
                UploadStore.put(job, "state", "done");
                UploadStore.put(job, "files", list.size());
                store.putJob(job);
                for (String r : list) store.removeFile(r);
                notifyDone(id, "Đã lưu đóng hàng " + label, "Video đã tải xong và đơn đã được lưu.");
            } else {
                UploadStore.put(job, "state", "failed");
                UploadStore.put(job, "error", res[1].isEmpty() ? "HTTP " + code : res[1]);
                store.putJob(job);
                notifyDone(id, "Chưa lưu được đơn " + label, job.optString("error"));
            }
        }
        return worked;
    }

    /** POST JSON; returns {status, server error message}. Throws RetryLater when offline. */
    private String[] post(String url, String token, String body) throws RetryLater {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setConnectTimeout(30000);
            c.setReadTimeout(60000);
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Content-Type", "application/json");
            byte[] data = body.getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(data.length);
            try (OutputStream out = c.getOutputStream()) { out.write(data); }
            int code = c.getResponseCode();
            if (code >= 500 || code == 429) throw new RetryLater("HTTP " + code);
            return new String[]{String.valueOf(code), code >= 300 ? serverMessage(c) : ""};
        } catch (IOException e) {
            throw new RetryLater(e.getMessage());
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String serverMessage(HttpURLConnection c) {
        try (InputStream in = c.getErrorStream() != null ? c.getErrorStream() : c.getInputStream()) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int r;
            while ((r = in.read(buf)) > 0) b.write(buf, 0, r);
            return new JSONObject(b.toString("UTF-8")).optString("error", "");
        } catch (Exception e) {
            return "";
        }
    }

    // ---- notifications ------------------------------------------------------------------------

    private void progress(UploadStore store, String ref, long inFlight) {
        store.emitProgress(ref, inFlight);
        JSONObject f = store.file(ref);
        if (f == null) return;
        long size = Math.max(1, f.optLong("size"));
        int pct = (int) Math.min(100, store.sent(f, inFlight) * 100 / size);
        setForegroundAsync(foregroundInfo("Đang tải " + f.optString("name"), pct));
    }

    private ForegroundInfo foregroundInfo(String text, int pct) {
        Context ctx = getApplicationContext();
        ensureChannel(ctx);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle("QBooks đang tải video")
                .setContentText(text)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .setContentIntent(openApp(ctx))
                .setProgress(100, pct, pct == 0);
        if (Build.VERSION.SDK_INT >= 29)
            return new ForegroundInfo(NOTIF_PROGRESS, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        return new ForegroundInfo(NOTIF_PROGRESS, b.build());
    }

    private void notifyDone(String orderId, String title, String text) {
        Context ctx = getApplicationContext();
        ensureChannel(ctx);
        try {
            NotificationManagerCompat.from(ctx).notify(orderId.hashCode(), new NotificationCompat.Builder(ctx, CHANNEL)
                    .setSmallIcon(android.R.drawable.stat_sys_upload_done)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                    .setAutoCancel(true)
                    .setContentIntent(openApp(ctx))
                    .build());
        } catch (SecurityException ignored) { } // notifications not allowed: the app shows it on next open
    }

    private static PendingIntent openApp(Context ctx) {
        Intent i = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) == null)
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Tải video đóng hàng", NotificationManager.IMPORTANCE_LOW));
    }
}
