package co.risip.app;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.lang.reflect.Method;

/**
 * Bridges the soft-keyboard state to the web layer.
 *
 * On some Samsung firmwares under adjustNothing, visualViewport resizes, the
 * Capacitor Keyboard plugin, window-insets listeners, and window display-frame
 * changes all stay silent.  The last reliable signal is the input method
 * window's own height.  {@link InputMethodManager#getInputMethodWindowVisibleHeight()}
 * is a @hide method but is readable on API 29 via reflection; it reports the
 * real on-screen keyboard height in physical pixels regardless of the window's
 * softInputMode.  We poll it and dispatch a risip:keyboard event.
 */
public class MainActivity extends BridgeActivity {

    private static final long POLL_MS = 120;
    private static final float MIN_HEIGHT_PX = 120f;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Method imeHeightMethod = findImeHeightMethod();
    private Integer lastHeight = null;

    private static Method findImeHeightMethod() {
        try {
            Method m = InputMethodManager.class.getMethod("getInputMethodWindowVisibleHeight");
            m.setAccessible(true);
            return m;
        } catch (Exception ignored) {
            return null;
        }
    }

    private final Runnable poller = new Runnable() {
        @Override
        public void run() {
            if (isFinishing() || isDestroyed()) return;
            try {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web != null) {
                    int heightPx = imeHeight();
                    if (heightPx < 0) return;
                    int height = heightPx >= MIN_HEIGHT_PX ? heightPx : 0;
                    if (lastHeight == null || lastHeight != height) {
                        lastHeight = height;
                        dispatch(web, height > 0, height);
                    }
                }
            } catch (Exception ignored) {
                // Transient; keep polling.
            }
            handler.postDelayed(this, POLL_MS);
        }
    };

    private int imeHeight() {
        try {
            InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (imm == null) return -1;
            if (imeHeightMethod != null) {
                Object v = imeHeightMethod.invoke(imm);
                return v instanceof Integer ? (Integer) v : -1;
            }
        } catch (Exception ignored) {
        }
        // Fallback: is this editable, using rect accounting.
        try {
            InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (imm != null && imm.isAcceptingText()) {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web != null) {
                    Rect r = new Rect();
                    web.getWindowVisibleDisplayFrame(r);
                    int visible = web.getHeight() - r.height();
                    if (visible > 0) return visible;
                }
            }
        } catch (Exception ignored) {
        }
        return -1;
    }

    private void dispatch(WebView web, boolean shown, int heightPx) {
        final String js = "window.dispatchEvent(new CustomEvent('risip:keyboard',{detail:{shown:" + shown + ",heightPx:" + heightPx + "}}))";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupWebView();
        handler.post(poller);
    }

    /**
     * The app is a light-only, portrait-only shell. Android 10+ WebViews
     * otherwise apply the system "Force Dark" to web content when the user
     * enables dark mode, which would silently repaint the Swahili UI in dark —
     * the app has its own fixed palette, so dark mode must never leak in from
     * the device.
     */
    private void setupWebView() {
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) {
            handler.post(this::setupWebView);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                Method m = WebSettings.class.getMethod("setForceDarkAllowed", boolean.class);
                m.invoke(web.getSettings(), false);
            } catch (Exception ignored) {
                // Below the hidden API surface; the light theme + color-scheme
                // CSS keep the UI light anyway.
            }
        }
        web.setBackgroundColor(0xFFF6F5F0);
    }
}