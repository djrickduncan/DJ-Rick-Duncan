package com.djrickduncan.copilot;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A second, full-screen browser holding TikTok's live page, logged in as the crew account.
 * It stays loaded (invisible) behind the Co-Pilot screen so the app can read the chat and
 * post approved messages. Nothing is posted unless the app asks for it.
 */
@CapacitorPlugin(name = "TikTokWeb")
public class TikTokWebPlugin extends Plugin {
    private FrameLayout overlay;
    private WebView web;
    private String injectScript = "";
    private OnBackPressedCallback backCallback;

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        String userAgent = call.getString("userAgent");
        String script = call.getString("script", "");
        if (url == null) {
            call.reject("url is required");
            return;
        }
        getActivity().runOnUiThread(() -> {
            ensureView();
            injectScript = script;
            if (userAgent != null && !userAgent.isEmpty()) web.getSettings().setUserAgentString(userAgent);
            web.loadUrl(url);
            call.resolve();
        });
    }

    @PluginMethod
    public void show(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ensureView();
            overlay.setVisibility(View.VISIBLE);
            overlay.bringToFront();
            backCallback.setEnabled(true);
            call.resolve();
        });
    }

    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            hideOverlay();
            call.resolve();
        });
    }

    @PluginMethod
    public void evaluate(PluginCall call) {
        String code = call.getString("code", "");
        getActivity().runOnUiThread(() -> {
            if (web == null) {
                call.reject("TikTok page is not open");
                return;
            }
            web.evaluateJavascript(code, (result) -> {
                JSObject ret = new JSObject();
                ret.put("result", result);
                call.resolve(ret);
            });
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (web != null) {
                web.loadUrl("about:blank");
            }
            hideOverlay();
            call.resolve();
        });
    }

    @PluginMethod
    public void logout(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            CookieManager.getInstance().removeAllCookies((ok) -> call.resolve());
            CookieManager.getInstance().flush();
        });
    }

    private void hideOverlay() {
        if (overlay != null) overlay.setVisibility(View.INVISIBLE); // stays loaded and running
        if (backCallback != null) backCallback.setEnabled(false);
        notifyListeners("hidden", new JSObject());
    }

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    private void ensureView() {
        if (web != null) return;
        overlay = new FrameLayout(getActivity());
        overlay.setBackgroundColor(Color.parseColor("#0B0B10"));

        web = new WebView(getActivity());
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "CopilotBridge");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (!injectScript.isEmpty()) view.evaluateJavascript(injectScript, null);
                CookieManager.getInstance().flush();
                JSObject data = new JSObject();
                data.put("url", url);
                notifyListeners("pageLoaded", data);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                // Keep normal web pages in here; block "open in the TikTok app" redirects.
                return !("http".equals(scheme) || "https".equals(scheme));
            }
        });
        overlay.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        Button back = new Button(getActivity());
        back.setText("◀  Back to Co-Pilot");
        back.setAllCaps(false);
        back.setTextColor(Color.WHITE);
        back.setBackgroundColor(Color.parseColor("#FF2D6F"));
        back.setPadding(36, 18, 36, 18);
        back.setOnClickListener((v) -> hideOverlay());
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        lp.setMargins(0, 24, 24, 0);
        overlay.addView(back, lp);

        // Keep clear of the status and navigation bars.
        ViewCompat.setOnApplyWindowInsetsListener(overlay, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        ViewGroup root = (ViewGroup) getBridge().getWebView().getParent();
        root.addView(overlay, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        overlay.setVisibility(View.INVISIBLE);
        ViewCompat.requestApplyInsets(overlay);

        backCallback = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack() && !String.valueOf(web.getUrl()).contains("/live")) web.goBack();
                else hideOverlay();
            }
        };
        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), backCallback);
    }

    /** Messages from the script running inside the TikTok page. */
    private class Bridge {
        @JavascriptInterface
        public void post(String json) {
            JSObject data = new JSObject();
            data.put("data", json);
            notifyListeners("message", data);
        }
    }
}
