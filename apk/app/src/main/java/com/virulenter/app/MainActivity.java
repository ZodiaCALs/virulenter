/*
 * Virulenter for Android
 *
 * A thin, offline Android wrapper around the app in app/. It does not
 * reimplement anything: the web assets are bundled into the APK and served to
 * a WebView through WebViewAssetLoader on the virtual https origin
 * https://appassets.androidplatform.net/, which keeps the app on a secure
 * origin. That matters for two reasons:
 *
 *   1. the app's whole persistence model is the URL fragment, and a secure
 *      origin is what lets it keep writing there;
 *   2. the app keeps nothing in browser storage, exactly as on the web
 *      build — except a background picture the user uploads (IndexedDB).
 *
 * The only Android-specific work is giving <a download> a real destination:
 * the web code produces Blob object URLs, which a WebView cannot download on
 * its own, so exports are routed to the system Downloads folder (or handed to
 * a share sheet) through the JavaScript bridge at the bottom of this file;
 * and answering <input type="file"> — importing a backup, choosing a
 * background picture — with the system file picker.
 */
package com.virulenter.app;

import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.activity.ComponentActivity;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicInteger;

public class MainActivity extends ComponentActivity {

    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String ENTRY = ORIGIN + "/index.html";

    /* The entire log lives in the URL fragment, so this string IS the saved
       session. It is persisted twice: in the activity's saved state (fast, and
       the normal path when Android recreates us) and in a private file (which
       also covers a force-kill or a reboot, where no saved state is offered). */
    private static final String KEY_URL = "virulenter.url";
    private static final String SESSION_FILE = "session-url.json";
    private static final int STATE_VERSION = 1;

    private WebView web;
    private String pendingUrl;

    /* <input type="file"> in the page opens the system picker; its answer
       goes back to the page through this callback */
    private ValueCallback<Uri[]> fileCallback;
    private final ActivityResultLauncher<Intent> filePicker = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(), result -> {
                ValueCallback<Uri[]> callback = fileCallback;
                fileCallback = null;
                if (callback != null) {
                    callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData()));
                }
            });
    private final AtomicInteger pending = new AtomicInteger(0);

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        /* Restore order matters: the bundle is the most recent truth, the file
           is the durable fallback, and the bundled entry point is the default
           for a genuinely first run. */
        String restore = null;
        if (state != null) {
            String fromState = state.getString(KEY_URL);
            if (isRestorable(fromState)) restore = fromState;
        }
        if (restore == null) {
            String fromFile = readSessionFile();
            if (isRestorable(fromFile)) restore = fromFile;
        }
        pendingUrl = restore != null ? restore : ENTRY;

        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.setFitsSystemWindows(true);
        setContentView(root);

        /* A debug build can be inspected from chrome://inspect on a computer
           over USB. WebView debugging ignores the manifest's debuggable flag,
           so it has to be switched on here; release builds never are. */
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        web = new WebView(this);
        web.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        /* keep text at the size the layout was designed for */
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(true);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (ORIGIN.equals(uri.getScheme() + "://" + uri.getHost())) return false;
                /* anything else is a real outbound link */
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                /* Re-save on every navigation so the durable copy tracks the app
                   even if the process is killed before any lifecycle callback. */
                if (isRestorable(url)) writeSessionFile(url);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    filePicker.launch(params.createIntent());
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "VirulenterNative");
        web.loadUrl(pendingUrl);

        /* Let the open sheet close before the app exits. */
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                web.evaluateJavascript(
                        "(function(){try{return !!document.querySelector('.overlay:not([hidden])')}catch(e){return false}})()",
                        value -> {
                            if ("true".equals(value)) {
                                web.evaluateJavascript(
                                        "(function(){try{var o=document.querySelector('.overlay:not([hidden])');" +
                                        "if(o)o.querySelector('[data-close]').click()}catch(e){}})()", null);
                            } else if (web.canGoBack()) {
                                web.goBack();
                            } else {
                                setEnabled(false);
                                getOnBackPressedDispatcher().onBackPressed();
                            }
                        });
            }
        });
    }

    /**
     * Writes an exported file where the user can actually find it.
     *
     * Receives base64 from the web layer rather than a URL, because the app
     * builds its exports as Blob object URLs, which WebView cannot fetch.
     */
    private final class Bridge {

        /** Capability probe, so the web layer can offer file sharing only where
         *  the platform can actually do it. */
        @JavascriptInterface
        public boolean canShare() {
            return true;
        }

        /**
         * Called by the web layer immediately after it rewrites the session URL.
         *
         * This is not optional. The app updates its state with
         * history.replaceState(), which fires no navigation, so onPageFinished
         * never runs again — without this the durable copy would hold whatever
         * URL the page was loaded with and every tap since would be lost when
         * Android kills the app in the background.
         *
         * Runs on the WebView's JavaScript thread, which is fine: the
         * persistence below is pure file I/O and touches no view.
         */
        @JavascriptInterface
        public void sessionChanged() {
            String url = readUrlFromWebView();
            if (url != null) writeSessionFile(url);
        }

        @JavascriptInterface
        public String currentSessionUrl() {
            String url = readUrlFromWebView();
            return url == null ? "" : url;
        }

        @JavascriptInterface
        public void saveBase64(final String name, final String mime, final String base64, final boolean share) {
            final byte[] bytes;
            try {
                bytes = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                return;
            }
            final int ticket = pending.incrementAndGet();
            runOnUiThread(() -> {
                String result;
                try {
                    File file = share ? writeCache(name, bytes) : writeDownloads(name, mime, bytes);
                    if (share) {
                        shareFile(file, mime);
                        result = "Ready to share";
                    } else {
                        result = "Saved to Downloads";
                    }
                } catch (Exception e) {
                    result = "Could not save the file";
                }
                if (pending.decrementAndGet() == 0) {
                    Toast.makeText(MainActivity.this, result, Toast.LENGTH_SHORT).show();
                }
            });
        }

        /* MediaStore on Android 10+, so no storage permission is needed */
        private File writeDownloads(String name, String mime, byte[] bytes) throws Exception {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri target = getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (target == null) throw new Exception("no downloads collection");
                try (OutputStream out = getContentResolver().openOutputStream(target)) {
                    if (out == null) throw new Exception("no stream");
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(target, values, null, null);
                return null;
            }
            File dir = Environment
                    .getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("no downloads dir");
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            return file;
        }

        private File writeCache(String name, byte[] bytes) throws Exception {
            File dir = new File(getCacheDir(), "exports");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("no cache dir");
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            return file;
        }

        private void shareFile(File file, String mime) {
            if (file == null) return;
            Uri uri = FileProvider.getUriForFile(
                    MainActivity.this, getPackageName() + ".files", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, "Share export"));
        }
    }

    /* ── session persistence ──────────────────────────────────────────────
       On Android the app is routinely killed in the background, and a WebView's
       own saveState()/restoreState() does not reliably carry the URL fragment
       back — which is exactly where this app keeps everything. So the URL is
       captured and replayed explicitly. */

    /** Only ever restore a page we served, never an external URL. */
    private static boolean isRestorable(String url) {
        return url != null && url.startsWith(ORIGIN + "/");
    }

    /** Reads the live URL on the UI thread; safe to call from the JS bridge. */
    private String readUrlFromWebView() {
        final WebView view = web;
        if (view == null) return null;
        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
            return isRestorable(urlOf(view)) ? urlOf(view) : null;
        }
        final String[] holder = new String[1];
        final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
        view.post(() -> {
            holder[0] = urlOf(view);
            latch.countDown();
        });
        try {
            if (!latch.await(500, java.util.concurrent.TimeUnit.MILLISECONDS)) return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
        return isRestorable(holder[0]) ? holder[0] : null;
    }

    private static String urlOf(WebView view) {
        String url = view.getUrl();
        if (isRestorable(url)) return url;
        /* getUrl() can lag behind history.replaceState(); originalUrl() still
           carries the fragment the app wrote. */
        String original = view.getOriginalUrl();
        if (isRestorable(original)) return original;
        return url;
    }

    private String currentUrl() {
        return readUrlFromWebView();
    }

    private void persistSession() {
        String url = currentUrl();
        if (url != null && !url.equals(pendingUrl)) {
            pendingUrl = url;
            writeSessionFile(url);
        }
    }

    private File sessionFile() {
        return new File(getFilesDir(), SESSION_FILE);
    }

    private void writeSessionFile(String url) {
        try (FileOutputStream out = new FileOutputStream(sessionFile())) {
            JSONObject json = new JSONObject();
            json.put("v", STATE_VERSION);
            json.put("url", url);
            out.write(json.toString().getBytes("UTF-8"));
        } catch (Exception ignored) {
            /* losing the durable copy is not fatal: state restore still works */
        }
    }

    private String readSessionFile() {
        File file = sessionFile();
        if (!file.exists()) return null;
        try {
            byte[] buf = new byte[(int) Math.min(file.length(), 1 << 20)];
            try (java.io.FileInputStream in = new java.io.FileInputStream(file)) {
                int read = 0;
                while (read < buf.length) {
                    int n = in.read(buf, read, buf.length - read);
                    if (n < 0) break;
                    read += n;
                }
            }
            JSONObject json = new JSONObject(new String(buf, "UTF-8").trim());
            if (json.optInt("v") != STATE_VERSION) return null;
            return json.optString("url", null);
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        /* the reliable moment to snapshot: called before the process can be
           killed in the background */
        persistSession();
        /* out of sight, the page stops: no animation, layout or JS timers
           (it is the only WebView, so pausing them all is safe) */
        if (web != null) {
            web.onPause();
            web.pauseTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            web.resumeTimers();
        }
    }

    @Override
    protected void onRestoreInstanceState(Bundle state) {
        super.onRestoreInstanceState(state);
        String url = state.getString(KEY_URL);
        if (isRestorable(url) && !url.equals(pendingUrl)) {
            pendingUrl = url;
            if (web != null) web.loadUrl(url);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        persistSession();
        if (pendingUrl != null) out.putString(KEY_URL, pendingUrl);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        persistSession();
        if (web != null) {
            web.setVisibility(View.GONE);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
