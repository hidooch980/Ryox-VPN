package com.ryox.vpn

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.net.VpnService
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.webkit.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import com.ryox.vpn.bridge.AndroidBridge
import com.ryox.vpn.service.RyoxVpnService

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
        private const val STATS_PUSH_INTERVAL_MS = 1000L
    }

    private lateinit var webView: WebView
    private lateinit var loadingOverlay: View
    private lateinit var androidBridge: AndroidBridge
    private var pendingServerJson: String? = null

    private val statsHandler = Handler(Looper.getMainLooper())
    private val statsPusher = object : Runnable {
        override fun run() {
            pushStatsToWeb()
            statsHandler.postDelayed(this, STATS_PUSH_INTERVAL_MS)
        }
    }

    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val serverJson = pendingServerJson
        pendingServerJson = null
        if (result.resultCode == Activity.RESULT_OK && serverJson != null) {
            startVpnService(serverJson)
        } else {
            notifyStateToWeb()
            notifyErrorToWeb("VPN permission was not granted, so RYOX stayed disconnected.")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        loadingOverlay = findViewById(R.id.loading_overlay)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            // The dashboard is served over https://appassets.androidplatform.net and
            // references no file:// or content:// URL, so both stay closed.
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            // Everything is same-origin appassets over https; never downgrade.
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        webView.setBackgroundColor(0xFF05070D.toInt())

        androidBridge = AndroidBridge(this)
        webView.addJavascriptInterface(androidBridge, "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                loadingOverlay.animate().alpha(0f).setDuration(400).withEndAction {
                    loadingOverlay.visibility = View.GONE
                }
                // The React stats panel asks for getStats() once at load; keep it
                // fresh from here because nothing on the JS side polls.
                pushStatsToWeb()
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.startsWith("https://appassets.androidplatform.net")) {
                    return false
                }
                // Open external links in device browser
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                } catch (_: Exception) {}
                return true
            }
        }

        // Load the full-featured Cyberpunk React web dashboard
        webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    override fun onResume() {
        super.onResume()
        notifyStateToWeb()
        startStatsPusher()
    }

    override fun onPause() {
        super.onPause()
        stopStatsPusher()
    }

    override fun onDestroy() {
        stopStatsPusher()
        super.onDestroy()
    }

    fun prepareAndConnect(serverJson: String) {
        pendingServerJson = serverJson
        val intent = VpnService.prepare(this)
        if (intent != null) {
            vpnPermissionLauncher.launch(intent)
        } else {
            startVpnService(serverJson)
        }
    }

    fun startVpnService(serverJson: String) {
        if (RyoxVpnService.buildSingBoxConfig(serverJson) == null) {
            // Refuse a node the core cannot dial instead of starting a client with
            // invented credentials and reporting Connected.
            notifyErrorToWeb("This node is missing the data RYOX needs (uuid / password / keys), so it cannot be dialled.")
            return
        }

        try {
            val intent = Intent(this, RyoxVpnService::class.java).apply {
                action = RyoxVpnService.ACTION_CONNECT
                // Hand the whole VpnServerConfig over; the service builds the
                // sing-box outbound from the real protocol/method/keys.
                putExtra(RyoxVpnService.EXTRA_SERVER_JSON, serverJson)
            }
            startService(intent)
            notifyStateToWeb()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start RyoxVpnService: ${e.message}", e)
            notifyErrorToWeb(e.message ?: "Failed to start the VPN service.")
        }
    }

    fun stopVpnService() {
        val intent = Intent(this, RyoxVpnService::class.java).apply {
            action = RyoxVpnService.ACTION_DISCONNECT
        }
        try {
            startService(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop RyoxVpnService: ${e.message}", e)
        }
        notifyStateToWeb()
    }

    private fun startStatsPusher() {
        statsHandler.removeCallbacks(statsPusher)
        statsHandler.postDelayed(statsPusher, STATS_PUSH_INTERVAL_MS)
    }

    private fun stopStatsPusher() {
        statsHandler.removeCallbacks(statsPusher)
    }

    /** Pushes the real LiveStats object the desktop bridge would have sent. */
    private fun pushStatsToWeb() {
        if (!::webView.isInitialized || !::androidBridge.isInitialized) return
        val json = try {
            androidBridge.getStats()
        } catch (e: Exception) {
            Log.e(TAG, "getStats() failed: ${e.message}", e)
            return
        }
        webView.post {
            webView.evaluateJavascript(
                "if (window._onAndroidStatsUpdated) window._onAndroidStatsUpdated($json);",
                null
            )
        }
    }

    private fun notifyStateToWeb() {
        if (!::webView.isInitialized) return
        val state = RyoxVpnService.connectionState
        webView.post {
            webView.evaluateJavascript(
                "if (window._onAndroidStateChanged) window._onAndroidStateChanged('$state');",
                null
            )
        }
    }

    private fun notifyErrorToWeb(message: String) {
        if (!::webView.isInitialized) return
        val escaped = message
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", " ")
        webView.post {
            webView.evaluateJavascript(
                "if (window._onAndroidLog) window._onAndroidLog('ERROR', '$escaped');",
                null
            )
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
