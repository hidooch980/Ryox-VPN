package com.ryox.vpn

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.net.VpnService
import android.os.Bundle
import android.view.View
import android.webkit.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.ryox.vpn.bridge.AndroidBridge
import com.ryox.vpn.service.RyoxVpnService

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var loadingOverlay: View
    private val gson = Gson()
    private var pendingServerJson: String? = null

    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            pendingServerJson?.let { startVpnService(it) }
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
            allowFileAccess = true
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        webView.setBackgroundColor(0xFF05070D.toInt())
        webView.addJavascriptInterface(AndroidBridge(this), "AndroidBridge")

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
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.startsWith("https://appassets.androidplatform.net") || url.startsWith("file:///")) {
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
        try {
            val type = object : TypeToken<Map<String, Any>>() {}.type
            val server: Map<String, Any> = gson.fromJson(serverJson, type) ?: emptyMap()
            val serverName = server["name"] as? String ?: "RYOX Secure Node"
            val serverHost = server["server"] as? String ?: "127.0.0.1"
            val serverPort = (server["port"] as? Number)?.toInt() ?: 443

            val intent = Intent(this, RyoxVpnService::class.java).apply {
                action = RyoxVpnService.ACTION_CONNECT
                putExtra("SERVER_NAME", serverName)
                putExtra("SERVER_HOST", serverHost)
                putExtra("SERVER_PORT", serverPort)
            }
            startService(intent)
            notifyStateToWeb()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun stopVpnService() {
        val intent = Intent(this, RyoxVpnService::class.java).apply {
            action = RyoxVpnService.ACTION_DISCONNECT
        }
        startService(intent)
        notifyStateToWeb()
    }

    private fun notifyStateToWeb() {
        val state = if (RyoxVpnService.isRunning) "CONNECTED" else "DISCONNECTED"
        webView.post {
            webView.evaluateJavascript("if (window._onAndroidStateChanged) window._onAndroidStateChanged('$state');", null)
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
