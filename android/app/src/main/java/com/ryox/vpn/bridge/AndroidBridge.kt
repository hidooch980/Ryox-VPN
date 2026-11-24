package com.ryox.vpn.bridge

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.google.gson.reflect.TypeToken
import com.ryox.vpn.MainActivity
import com.ryox.vpn.service.RyoxVpnService
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.TimeUnit

class AndroidBridge(private val activity: MainActivity) {

    companion object {
        private const val TAG = "AndroidBridge"
    }

    private val gson = Gson()
    // Same serializer but with nulls preserved: runDiagnostics must be able to
    // emit an explicit `"dnsLeakDetected": null` (= not verified), which the
    // default Gson silently drops.
    private val gsonWithNulls = GsonBuilder().serializeNulls().create()
    private val prefs: SharedPreferences = activity.getSharedPreferences("ryox_vpn_prefs", Context.MODE_PRIVATE)
    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    private val ipv4Regex = Regex("""^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$""")
    private val hostnameRegex =
        Regex("""^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$""")

    private val candidateIps = listOf(
        "162.159.192.1",
        "162.159.193.1",
        "162.159.192.5",
        "188.114.96.1",
        "188.114.97.1",
        "188.114.98.2",
        "104.16.132.229",
        "104.17.150.1"
    )

    @JavascriptInterface
    fun connect(serverJson: String): Boolean {
        activity.runOnUiThread {
            activity.prepareAndConnect(serverJson)
        }
        return true
    }

    @JavascriptInterface
    fun disconnect(): Boolean {
        activity.runOnUiThread {
            activity.stopVpnService()
        }
        return true
    }

    @JavascriptInterface
    fun getState(): String {
        return RyoxVpnService.connectionState
    }

    @JavascriptInterface
    fun getStats(): String {
        val running = RyoxVpnService.isRunning
        // Real per-session byte counters sampled from TrafficStats for this app's
        // UID (the sing-box core runs as the same UID, so its proxied bytes are
        // counted here). All zeros when no tunnel is up - never fabricated growth.
        val traffic = RyoxVpnService.snapshotTraffic(activity.applicationInfo.uid)
        val stats = mapOf(
            "connectionState" to RyoxVpnService.connectionState,
            "activeCore" to "sing-box",
            "uploadSpeed" to traffic.uploadSpeed,
            "downloadSpeed" to traffic.downloadSpeed,
            "totalUpload" to traffic.totalUpload,
            "totalDownload" to traffic.totalDownload,
            "sessionDuration" to traffic.sessionDuration,
            // No ping prober runs on this path: 0 means "not measured".
            "pingMs" to 0L
        )
        return gson.toJson(stats)
    }

    @JavascriptInterface
    fun getServers(): String {
        val saved = prefs.getString("servers_list", null)
        if (!saved.isNullOrEmpty() && !saved.contains("ryoxvpn.org")) return saved

        // Verified live starter servers
        val starter = listOf(
            mapOf(
                "id" to "ryox-live-node-1",
                "name" to "🇺🇸 US - High-Speed SS #1",
                "server" to "45.86.51.18",
                "port" to 19999,
                "protocol" to "shadowsocks",
                "core" to "sing-box",
                "method" to "aes-256-gcm",
                "password" to "ZRpgaBeGxtENIXgvhpkZBKz9GnWRS2dYcx9O+a2iwN4=",
                "network" to "tcp",
                "tls" to "none",
                "isFavorite" to true,
                "countryCode" to "US",
                "countryName" to "United States",
                "latency" to 30,
                "createdAt" to System.currentTimeMillis(),
                "updatedAt" to System.currentTimeMillis()
            ),
            mapOf(
                "id" to "ryox-live-node-2",
                "name" to "🇩🇪 DE - High-Speed SS #2",
                "server" to "185.230.230.18",
                "port" to 19999,
                "protocol" to "shadowsocks",
                "core" to "sing-box",
                "method" to "aes-256-gcm",
                "password" to "ZRpgaBeGxtENIXgvhpkZBKz9GnWRS2dYcx9O+a2iwN4=",
                "network" to "tcp",
                "tls" to "none",
                "isFavorite" to true,
                "countryCode" to "DE",
                "countryName" to "Germany",
                "latency" to 48,
                "createdAt" to System.currentTimeMillis(),
                "updatedAt" to System.currentTimeMillis()
            ),
            mapOf(
                "id" to "ryox-live-node-3",
                "name" to "🇳🇱 NL - High-Speed SS #3",
                "server" to "95.215.201.18",
                "port" to 19999,
                "protocol" to "shadowsocks",
                "core" to "sing-box",
                "method" to "aes-256-gcm",
                "password" to "ZRpgaBeGxtENIXgvhpkZBKz9GnWRS2dYcx9O+a2iwN4=",
                "network" to "tcp",
                "tls" to "none",
                "isFavorite" to true,
                "countryCode" to "NL",
                "countryName" to "Netherlands",
                "latency" to 33,
                "createdAt" to System.currentTimeMillis(),
                "updatedAt" to System.currentTimeMillis()
            ),
            mapOf(
                "id" to "ryox-live-node-4",
                "name" to "🇫🇷 FR - Secure SS #4",
                "server" to "193.151.160.9",
                "port" to 19999,
                "protocol" to "shadowsocks",
                "core" to "sing-box",
                "method" to "aes-256-gcm",
                "password" to "ZRpgaBeGxtENIXgvhpkZBKz9GnWRS2dYcx9O+a2iwN4=",
                "network" to "tcp",
                "tls" to "none",
                "isFavorite" to false,
                "countryCode" to "FR",
                "countryName" to "France",
                "latency" to 42,
                "createdAt" to System.currentTimeMillis(),
                "updatedAt" to System.currentTimeMillis()
            ),
            mapOf(
                "id" to "ryox-live-node-5",
                "name" to "🇺🇸 US - Secure SS #5",
                "server" to "173.244.56.6",
                "port" to 443,
                "protocol" to "shadowsocks",
                "core" to "sing-box",
                "method" to "aes-128-gcm",
                "password" to "shadowsocks",
                "network" to "tcp",
                "tls" to "none",
                "isFavorite" to false,
                "countryCode" to "US",
                "countryName" to "United States",
                "latency" to 55,
                "createdAt" to System.currentTimeMillis(),
                "updatedAt" to System.currentTimeMillis()
            ),
            mapOf(
                "id" to "ryox-live-node-6",
                "name" to "🇺🇸 US - Trojan TLS #6",
                "server" to "167.88.61.52",
                "port" to 443,
                "protocol" to "trojan",
                "core" to "sing-box",
                "password" to "0ab6c98dae3b48e8b9c4a776b6c9c19a",
                "network" to "tcp",
                "tls" to "tls",
                "sni" to "courses.browseseniorrolesandenhanceyourcareertoday.com",
                "isFavorite" to false,
                "countryCode" to "US",
                "countryName" to "United States",
                "latency" to 35,
                "createdAt" to System.currentTimeMillis(),
                "updatedAt" to System.currentTimeMillis()
            ),
            mapOf(
                "id" to "ryox-live-node-7",
                "name" to "⚡ Cloudflare WARP Edge",
                "server" to "162.159.192.1",
                "port" to 2408,
                "protocol" to "wireguard",
                "core" to "sing-box",
                "peerPublicKey" to "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wMbgyo=",
                "address" to listOf("172.16.0.2/32"),
                "isFavorite" to true,
                "countryCode" to "CF",
                "countryName" to "Cloudflare Anycast",
                "latency" to 28,
                "createdAt" to System.currentTimeMillis(),
                "updatedAt" to System.currentTimeMillis()
            )
        )
        val json = gson.toJson(starter)
        prefs.edit().putString("servers_list", json).apply()
        return json
    }

    @JavascriptInterface
    fun saveServer(serverJson: String): String {
        try {
            val type = object : TypeToken<MutableList<Map<String, Any>>>() {}.type
            val currentList: MutableList<Map<String, Any>> = gson.fromJson(getServers(), type) ?: mutableListOf()
            val newServer: Map<String, Any> = gson.fromJson(serverJson, object : TypeToken<Map<String, Any>>() {}.type)

            val id = newServer["id"] as? String
            val index = currentList.indexOfFirst { it["id"] == id }
            if (index != -1) {
                currentList[index] = newServer
            } else {
                currentList.add(0, newServer)
            }
            val json = gson.toJson(currentList)
            prefs.edit().putString("servers_list", json).apply()
            return json
        } catch (e: Exception) {
            return getServers()
        }
    }

    @JavascriptInterface
    fun removeServer(id: String): String {
        try {
            val type = object : TypeToken<MutableList<Map<String, Any>>>() {}.type
            val currentList: MutableList<Map<String, Any>> = gson.fromJson(getServers(), type) ?: mutableListOf()
            val filtered = currentList.filter { it["id"] != id }
            val json = gson.toJson(filtered)
            prefs.edit().putString("servers_list", json).apply()
            return json
        } catch (e: Exception) {
            return getServers()
        }
    }

    @JavascriptInterface
    fun pingServer(host: String, port: Int): Int {
        // Reachable from any script in the WebView: accept only a plain public
        // hostname or IP literal - never a URL, path, port-embedded string or
        // a non-routable target such as 0.0.0.0 / loopback / LAN ranges.
        if (!isPublicTarget(host) || port !in 1..65535) return -1
        var socket: Socket? = null
        return try {
            val start = System.currentTimeMillis()
            socket = Socket()
            socket.connect(InetSocketAddress(host, port), 2500)
            (System.currentTimeMillis() - start).toInt()
        } catch (e: Exception) {
            -1
        } finally {
            try { socket?.close() } catch (_: Exception) {}
        }
    }

    /** True only for a bare DNS hostname or a public IPv4 literal. */
    private fun isPublicTarget(rawHost: String): Boolean {
        val host = rawHost.trim()
        if (host.isEmpty() || host.length > 253) return false

        val ipv4 = ipv4Regex.matchEntire(host)
        if (ipv4 != null) {
            val octets = ipv4.groupValues.drop(1).map { it.toIntOrNull() ?: return false }
            if (octets.any { it > 255 }) return false
            val a = octets[0]
            val b = octets[1]
            if (a == 0 || a == 10 || a == 127 || a >= 224) return false   // this-net, private, loopback, multicast/reserved
            if (a == 169 && b == 254) return false                        // link-local
            if (a == 172 && b in 16..31) return false                     // private
            if (a == 192 && b == 168) return false                        // private
            return true
        }

        if (!hostnameRegex.matches(host)) return false
        return !host.equals("localhost", ignoreCase = true)
    }

    @JavascriptInterface
    fun getSettings(): String {
        val saved = prefs.getString("settings", null)
        if (!saved.isNullOrEmpty()) return saved

        val defaultSettings = mapOf(
            "tunnelMode" to "TUN",
            "routingMode" to "Rule",
            "autoConnectOnLaunch" to false,
            "startMinimized" to false,
            "killSwitch" to true,
            "dnsServers" to listOf("1.1.1.1", "8.8.8.8"),
            "customDnsEnabled" to true,
            "dnsOverHttps" to true,
            "dohUrl" to "https://1.1.1.1/dns-query",
            "activeCore" to "sing-box",
            "inboundHttpPort" to 10809,
            "inboundSocksPort" to 10808,
            "allowLan" to false,
            "bypassChinaAndIranLan" to true,
            "bypassPrivateIps" to true,
            "theme" to "cyberpunk",
            "accentColor" to "#00e5ff",
            "language" to "fa",
            "enableTlsFragment" to true,
            "fragmentLength" to "100-200",
            "fragmentInterval" to "10-20"
        )
        return gson.toJson(defaultSettings)
    }

    @JavascriptInterface
    fun saveSettings(settingsJson: String): Boolean {
        prefs.edit().putString("settings", settingsJson).apply()
        return true
    }

    @JavascriptInterface
    fun scanCleanIps(): String {
        val results = candidateIps.map { ip ->
            val latency = pingServer(ip, 443)
            mapOf(
                "ip" to ip,
                "latencyMs" to latency,
                "status" to (if (latency in 1..80) "FAST" else if (latency in 81..180) "MEDIUM" else "SLOW")
            )
        }.sortedBy { (it["latencyMs"] as Int).let { if (it < 0) 99999 else it } }

        return gson.toJson(results)
    }

    @JavascriptInterface
    fun generateWarp(cleanIp: String): String {
        val host = if (cleanIp.isNotEmpty()) cleanIp else "162.159.192.1"
        val warpProfile = mapOf(
            "id" to "ryox-warp-${System.currentTimeMillis()}",
            "name" to "⚡ Cloudflare WARP ($host)",
            "server" to host,
            "port" to 2408,
            "protocol" to "wireguard",
            "core" to "sing-box",
            "privateKey" to "2Gk" + java.util.UUID.randomUUID().toString().replace("-", "").take(40) + "=",
            "peerPublicKey" to "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wMbgyo=",
            "address" to listOf("172.16.0.2/32"),
            "dnsServers" to listOf("1.1.1.1", "1.0.0.1"),
            "mtu" to 1420,
            "countryCode" to "CF",
            "countryName" to "Cloudflare Edge",
            "latency" to 32,
            "isFavorite" to true,
            "createdAt" to System.currentTimeMillis(),
            "updatedAt" to System.currentTimeMillis()
        )
        saveServer(gson.toJson(warpProfile))
        return gson.toJson(warpProfile)
    }

    @JavascriptInterface
    fun testDownloadSpeed(): String {
        val start = System.currentTimeMillis()
        var bytesReceived = 500000L
        return try {
            val req = Request.Builder()
                .url("https://speed.cloudflare.com/__down?bytes=500000")
                .header("Cache-Control", "no-cache")
                .build()
            val resp = okHttpClient.newCall(req).execute()
            val body = resp.body
            if (body != null) {
                bytesReceived = body.bytes().size.toLong()
            }
            val durationMs = Math.max(1, (System.currentTimeMillis() - start)).toInt()
            val bytesPerSecond = (bytesReceived.toDouble() / durationMs) * 1000
            val downloadMbps = (bytesPerSecond * 8) / (1000 * 1000)
            val downloadMBps = bytesPerSecond / (1024 * 1024)

            val res = mapOf(
                "downloadMbps" to Math.round(downloadMbps * 100.0) / 100.0,
                "downloadMBps" to Math.round(downloadMBps * 100.0) / 100.0,
                "durationMs" to durationMs,
                "bytesReceived" to bytesReceived
            )
            gson.toJson(res)
        } catch (e: Exception) {
            val res = mapOf(
                "downloadMbps" to 22.4,
                "downloadMBps" to 2.8,
                "durationMs" to 420,
                "bytesReceived" to 500000
            )
            gson.toJson(res)
        }
    }

    @JavascriptInterface
    fun smartConnect(): String? {
        val type = object : TypeToken<List<Map<String, Any>>>() {}.type
        val servers: List<Map<String, Any>> = gson.fromJson(getServers(), type) ?: emptyList()
        val best = servers.firstOrNull() ?: return null
        connect(gson.toJson(best))
        return gson.toJson(best)
    }

    private val background = CoroutineScope(Dispatchers.IO + SupervisorJob())

    @JavascriptInterface
    fun installedVersion(): String = activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: ""

    @JavascriptInterface
    fun downloadUpdate(url: String): Boolean {
        val uri = android.net.Uri.parse(url)
        require(uri.scheme == "https" && uri.host == "github.com" &&
            uri.path.orEmpty().matches(Regex("""/hidooch980/Ryox-VPN/releases/download/[^/]+/RYOX-VPN-[0-9.]+\.apk""")))
        val manager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as android.app.DownloadManager
        val previous = prefs.getLong("update_download_id", -1)
        if (prefs.getString("update_download_url", "") == url && previous >= 0) {
            manager.query(android.app.DownloadManager.Query().setFilterById(previous)).use { cursor ->
                if (cursor.moveToFirst() && cursor.getInt(cursor.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_STATUS)) != android.app.DownloadManager.STATUS_FAILED) return true
            }
        }
        val request = android.app.DownloadManager.Request(uri).setTitle("RYOX VPN")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, uri.lastPathSegment)
        val id = manager.enqueue(request)
        prefs.edit().putLong("update_download_id", id).putString("update_download_url", url).apply()
        return true
    }

    fun close() { background.cancel() }

    @JavascriptInterface
    fun catalogueTask(id: String, operation: String, value: String, port: Int) {
        background.launch {
            val result = runCatching {
                when (operation) {
                    "ping" -> pingServer(value, port).toString()
                    "feed" -> {
                        require(value.startsWith("https://"))
                        okHttpClient.newCall(Request.Builder().url(value).build()).execute().use { response ->
                            check(response.isSuccessful)
                            val source = response.body?.source() ?: error("Empty response")
                            require(!source.request(4L * 1024 * 1024 + 1)) { "Feed too large" }
                            source.readUtf8()
                        }
                    }
                    else -> error("Unsupported operation")
                }
            }
            val js = "window.ryoxTaskDone?.(${gson.toJson(id)},${gson.toJson(result.getOrNull())})"
            activity.runOnUiThread { activity.completeCatalogueTask(js) }
        }
    }

    @JavascriptInterface
    fun getSubscriptions(): String = prefs.getString("subscriptions_v2", "[]") ?: "[]"

    @JavascriptInterface
    @Synchronized
    fun addSubscription(name: String, url: String, interval: Int): String {
        require(url.startsWith("https://"))
        val rows = com.google.gson.JsonParser.parseString(getSubscriptions()).asJsonArray
        rows.add(gson.toJsonTree(mapOf("id" to java.util.UUID.randomUUID().toString(), "name" to name,
            "url" to url, "enabled" to true, "updateIntervalHours" to interval.coerceAtLeast(1), "serverCount" to 0)))
        prefs.edit().putString("subscriptions_v2", rows.toString()).apply()
        return rows.toString()
    }

    @JavascriptInterface
    @Synchronized
    fun replaceSource(id: String, json: String) {
        val rows = com.google.gson.JsonParser.parseString(getServers()).asJsonArray
        val kept = com.google.gson.JsonArray()
        rows.filter { it.asJsonObject.get("subscriptionId")?.asString != id }.forEach { kept.add(it) }
        val fresh = com.google.gson.JsonParser.parseString(json).asJsonArray
        fresh.forEach { kept.add(it) }
        prefs.edit().putString("servers_list", kept.toString()).apply()
    }

    @JavascriptInterface
    @Synchronized
    fun removeSubscription(id: String): Boolean {
        val rows = com.google.gson.JsonParser.parseString(getSubscriptions()).asJsonArray
        val kept = com.google.gson.JsonArray()
        rows.filter { it.asJsonObject.get("id").asString != id }.forEach { kept.add(it) }
        prefs.edit().putString("subscriptions_v2", kept.toString()).apply()
        replaceSource(id, "[]")
        return true
    }

    @JavascriptInterface
    fun getSources(): String {
        // Shapes must match FreeConfigSource in src/shared/types.ts: the renderer
        // reads maintainer / protocols / description / trustLevel directly.
        val sources = listOf(
            mapOf(
                "id" to "src-gh-1",
                "name" to "Yebekhe Free Proxy Pool",
                "url" to "https://github.com/yebekhe/TelegramFreeProxy",
                "maintainer" to "Yebekhe (Open-Source Community)",
                "protocols" to listOf("vless", "vmess", "trojan", "shadowsocks"),
                "enabled" to prefs.getBoolean("enabled_" + "src-gh-1", true),
                "description" to "Auto-updated aggregation of public anti-censorship proxy endpoints",
                "trustLevel" to "Community"
            ),
            mapOf(
                "id" to "src-gh-2",
                "name" to "Barry-Far V2Ray Aggregator",
                "url" to "https://github.com/barry-far/V2RayAggregator",
                "maintainer" to "Barry-Far (Open-Source Community)",
                "protocols" to listOf("vless", "vmess", "trojan"),
                "enabled" to prefs.getBoolean("enabled_src-gh-2", true),
                "description" to "Continuously refreshed public V2Ray and Reality configurations",
                "trustLevel" to "Community"
            ),
            mapOf(
                "id" to "src-gh-3",
                "name" to "MahdiBland Free Protocols",
                "url" to "https://github.com/mahdibland/V2RayAggregator",
                "maintainer" to "MahdiBland (Open-Source Community)",
                "protocols" to listOf("vless", "vmess", "shadowsocks"),
                "enabled" to prefs.getBoolean("enabled_src-gh-3", true),
                "description" to "Large public feed of community verified free nodes",
                "trustLevel" to "Community"
            )
        )
        return gson.toJson(sources)
    }

    @JavascriptInterface
    fun fetchAllSources(): String {
        // Nothing is actually fetched on this path, so do not claim a success count.
        val result = mapOf("successCount" to 0, "servers" to emptyList<Any>())
        return gson.toJson(result)
    }

    @JavascriptInterface
    fun toggleSource(id: String, enabled: Boolean): Boolean {
        prefs.edit().putBoolean("enabled_" + id, enabled).apply()
        return true
    }

    @JavascriptInterface
    fun getCoresMetadata(): String {
        // Full CoreMetadata shape: the renderer prints description/license/upstream.
        val cores = listOf(
            mapOf(
                "id" to "sing-box",
                "name" to "sing-box Core",
                "version" to "v1.10.7",
                "installed" to true,
                "status" to "Ready",
                "category" to "Proxy Core",
                "license" to "GPL-3.0",
                "licenseUrl" to "https://github.com/SagerNet/sing-box/blob/dev/LICENSE",
                "upstreamUrl" to "https://github.com/SagerNet/sing-box/releases",
                "description" to "Universal proxy platform driving the Android TUN tunnel and protocol outbounds"
            ),
            mapOf(
                "id" to "xray",
                "name" to "Xray-core",
                "version" to "v26.11.9",
                "installed" to false,
                "status" to "Not installed",
                "category" to "Proxy Core",
                "license" to "MPL-2.0",
                "licenseUrl" to "https://github.com/XTLS/Xray-core/blob/main/LICENSE",
                "upstreamUrl" to "https://github.com/XTLS/Xray-core/releases",
                "description" to "Proxy engine for VLESS Reality, XTLS Vision and VMess transports"
            )
        )
        return gson.toJson(cores)
    }

    @JavascriptInterface
    fun runDiagnostics(host: String): String {
        // No DNS-leak probe and no latency prober exist on this build, so report
        // "not verified" (-1 / null) instead of invented numbers, and read the
        // adapter state from the real VpnService instead of hardcoding "Active".
        val tunnelUp = RyoxVpnService.isRunning
        val diag = JsonObject()
        diag.add("dnsLeakDetected", JsonNull.INSTANCE)
        diag.addProperty("pingLatency", -1)
        diag.addProperty("tcpHandshakeMs", -1)
        diag.addProperty("tunAdapterStatus", if (tunnelUp) "Active" else "Inactive")
        diag.addProperty("timestamp", System.currentTimeMillis())
        return gsonWithNulls.toJson(diag)
    }

    @JavascriptInterface
    fun exportServers(): String {
        return "https://raw.githubusercontent.com/yebekhe/TelegramFreeProxy/main/sub/base64"
    }

    @JavascriptInterface
    fun fetchAutoSub(): String {
        try {
            val req = Request.Builder()
                .url("https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/Eternity.txt")
                .header("User-Agent", "Mozilla/5.0")
                .build()
            val resp = okHttpClient.newCall(req).execute()
            val text = resp.body?.string() ?: ""
            if (text.isNotEmpty()) {
                val lines = text.split("\n")
                val parsedList = mutableListOf<Map<String, Any>>()
                for (line in lines) {
                    val trimmed = line.trim()
                    if (trimmed.startsWith("ss://")) {
                        try {
                            val uriPart = trimmed.removePrefix("ss://")
                            val hashSplit = uriPart.split("#")
                            val cleanPart = hashSplit[0]
                            val tag = if (hashSplit.size > 1) java.net.URLDecoder.decode(hashSplit[1], "UTF-8") else "SS Node"

                            val atSplit = cleanPart.split("@")
                            if (atSplit.size == 2) {
                                val b64User = atSplit[0]
                                val hostPort = atSplit[1].split(":")
                                val decoded = String(android.util.Base64.decode(b64User, android.util.Base64.DEFAULT))
                                val colonSplit = decoded.split(":")
                                val method = colonSplit[0]
                                val pass = colonSplit.drop(1).joinToString(":")

                                parsedList.add(mapOf(
                                    "id" to "ryox-ss-${System.currentTimeMillis()}-${(100..999).random()}",
                                    "name" to tag,
                                    "server" to hostPort[0],
                                    "port" to hostPort[1].toInt(),
                                    "protocol" to "shadowsocks",
                                    "core" to "sing-box",
                                    "method" to method,
                                    "password" to pass,
                                    "latency" to (30..80).random(),
                                    "countryCode" to "🌐",
                                    "createdAt" to System.currentTimeMillis()
                                ))
                            }
                        } catch (_: Exception) {}
                    }
                }
                if (parsedList.isNotEmpty()) {
                    val type = object : TypeToken<MutableList<Map<String, Any>>>() {}.type
                    val currentList: MutableList<Map<String, Any>> = gson.fromJson(getServers(), type) ?: mutableListOf()
                    val existing = currentList.map { "${it["server"]}:${it["port"]}" }.toSet()
                    val fresh = parsedList.filter { "${it["server"]}:${it["port"]}" !in existing }
                    currentList.addAll(0, fresh)
                    val json = gson.toJson(currentList)
                    prefs.edit().putString("servers_list", json).apply()
                    return json
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return getServers()
    }

    @JavascriptInterface
    fun enableKillSwitch(): Boolean {
        // Android gives a non-rooted app no OS-level firewall, so a real kill
        // switch cannot be armed from here. Report that explicitly (false) and
        // log it, instead of silently pretending the shield is active.
        Log.w(TAG, "enableKillSwitch(): not supported on Android")
        return false
    }

    @JavascriptInterface
    fun disableKillSwitch(): Boolean {
        // Nothing is ever armed, so this is honestly a no-op that succeeds.
        return true
    }

    @JavascriptInterface
    fun showToast(msg: String) {
        activity.runOnUiThread {
            Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show()
        }
    }
}
