package com.ryox.vpn.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ProxyInfo
import android.net.TrafficStats
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.ryox.vpn.MainActivity
import com.ryox.vpn.R
import kotlinx.coroutines.*
import java.io.File

/**
 * Real per-session traffic counters. Every field is 0 when nothing is measured
 * (no tunnel up, or TrafficStats unsupported for this UID) - never fabricated.
 */
data class TrafficSnapshot(
    val uploadSpeed: Long,
    val downloadSpeed: Long,
    val totalUpload: Long,
    val totalDownload: Long,
    val sessionDuration: Long
)

class RyoxVpnService : VpnService() {

    companion object {
        const val TAG = "RyoxVpnService"
        const val ACTION_CONNECT = "com.ryox.vpn.ACTION_CONNECT"
        const val ACTION_DISCONNECT = "com.ryox.vpn.ACTION_DISCONNECT"

        /** Full VpnServerConfig JSON, see src/shared/types.ts. */
        const val EXTRA_SERVER_JSON = "SERVER_JSON"

        const val CHANNEL_ID = "ryox_vpn_service_channel"
        const val NOTIFICATION_ID = 1001

        /** Local mixed (SOCKS + HTTP) inbound the system proxy points at. */
        const val MIXED_INBOUND_PORT = 10808

        /**
         * Capturing all traffic in this app's VpnService TUN is deliberately OFF.
         *
         * The core is launched as a plain child process (libsingbox.so run -c),
         * so it cannot own this app's TUN file descriptor: nothing here ever
         * reads vpnInterface, and the bundled core (sing-box 1.10.7, see
         * jniLibs/arm64-v8a/libsingbox.so) has no fd hand-off entry point. Adding
         * addRoute("0.0.0.0", 0) would therefore black-hole every packet that does
         * not use the local proxy - including the VPN DNS servers 1.1.1.1 and
         * 8.8.8.8 - which is a device-wide connectivity outage, not a tunnel.
         * Flip this to true only together with a userspace stack / libbox JNI that
         * actually services the fd. The proxy route below stays functional.
         */
        private const val CAPTURE_ALL_TRAFFIC_IN_TUN = false

        @Volatile
        var isRunning: Boolean = false
            private set

        private var baselineUid: Int = -1
        private var baselineTx: Long = 0L
        private var baselineRx: Long = 0L
        private var sessionStartMs: Long = 0L
        private var lastSampleMs: Long = 0L
        private var lastTx: Long = 0L
        private var lastRx: Long = 0L
        private var lastSpeedUp: Long = 0L
        private var lastSpeedDown: Long = 0L

        /** Takes the byte-counter baseline for [uid] when a tunnel comes up. */
        fun markSessionStarted(uid: Int) {
            val tx = TrafficStats.getUidTxBytes(uid)
            val rx = TrafficStats.getUidRxBytes(uid)
            baselineUid = uid
            baselineTx = if (tx > 0L) tx else 0L
            baselineRx = if (rx > 0L) rx else 0L
            lastTx = baselineTx
            lastRx = baselineRx
            lastSampleMs = System.currentTimeMillis()
            sessionStartMs = lastSampleMs
            lastSpeedUp = 0L
            lastSpeedDown = 0L
        }

        /** Resets every counter; reported totals go back to honest zeros. */
        fun clearSession() {
            baselineUid = -1
            baselineTx = 0L
            baselineRx = 0L
            sessionStartMs = 0L
            lastSampleMs = 0L
            lastTx = 0L
            lastRx = 0L
            lastSpeedUp = 0L
            lastSpeedDown = 0L
        }

        /**
         * Per-session bytes for [uid] from TrafficStats (the sing-box core runs
         * under the same UID, so proxied traffic is counted). Speeds are deltas
         * between calls; 0 means "not measured". Safe to call from any thread.
         */
        fun snapshotTraffic(uid: Int): TrafficSnapshot {
            if (!isRunning) return TrafficSnapshot(0L, 0L, 0L, 0L, 0L)

            val tx = TrafficStats.getUidTxBytes(uid)
            val rx = TrafficStats.getUidRxBytes(uid)
            if (tx < 0L || rx < 0L) return TrafficSnapshot(0L, 0L, 0L, 0L, 0L)

            val now = System.currentTimeMillis()
            if (uid != baselineUid) {
                baselineUid = uid
                baselineTx = tx
                baselineRx = rx
                lastTx = tx
                lastRx = rx
                lastSampleMs = now
            } else {
                val elapsed = now - lastSampleMs
                if (elapsed >= 500L) {
                    val deltaUp = (tx - lastTx).coerceAtLeast(0L)
                    val deltaDown = (rx - lastRx).coerceAtLeast(0L)
                    lastSpeedUp = deltaUp * 1000L / elapsed
                    lastSpeedDown = deltaDown * 1000L / elapsed
                    lastTx = tx
                    lastRx = rx
                    lastSampleMs = now
                }
            }

            val duration = if (sessionStartMs == 0L) 0L else (now - sessionStartMs) / 1000L
            return TrafficSnapshot(
                uploadSpeed = lastSpeedUp,
                downloadSpeed = lastSpeedDown,
                totalUpload = (tx - baselineTx).coerceAtLeast(0L),
                totalDownload = (rx - baselineRx).coerceAtLeast(0L),
                sessionDuration = duration
            )
        }

        /**
         * Builds a complete sing-box config for one VpnServerConfig JSON.
         *
         * Returns null when the node has no usable outbound (unsupported protocol,
         * or missing uuid / password / keys / address). Callers must treat null as
         * "do not connect" so the UI can never claim Connected without a tunnel.
         */
        fun buildSingBoxConfig(serverJson: String): String? {
            val parsed = try {
                JsonParser.parseString(serverJson)
            } catch (e: Exception) {
                Log.e(TAG, "SERVER_JSON is not valid JSON: ${e.message}")
                null
            }
            if (parsed == null || !parsed.isJsonObject) {
                Log.e(TAG, "SERVER_JSON is not a JSON object")
                return null
            }
            val server = parsed.asJsonObject

            val protocol = server.stringOrNull("protocol")
            if (protocol.isNullOrBlank()) {
                Log.e(TAG, "SERVER_JSON has no protocol")
                return null
            }

            val host = server.stringOrNull("server")?.trim()
            val port = server.intOrZero("port")
            if (host.isNullOrBlank() || port !in 1..65535) {
                Log.e(TAG, "SERVER_JSON has no usable server/port (host=$host, port=$port)")
                return null
            }

            val outbound = buildOutbound(server, protocol.lowercase(), host, port)
            if (outbound == null) {
                Log.e(TAG, "No sing-box outbound can be built for protocol '$protocol'")
                return null
            }
            outbound.addProperty("tag", PROXY_TAG)

            val config = JsonObject()

            val log = JsonObject()
            log.addProperty("level", "warn")
            config.add("log", log)

            val mixedInbound = JsonObject()
            mixedInbound.addProperty("type", "mixed")
            mixedInbound.addProperty("tag", "mixed-in")
            mixedInbound.addProperty("listen", "127.0.0.1")
            mixedInbound.addProperty("listen_port", MIXED_INBOUND_PORT)
            val inbounds = JsonArray()
            inbounds.add(mixedInbound)
            config.add("inbounds", inbounds)

            // The bundled core is sing-box 1.10.7, which only understands the
            // legacy DNS server schema ({"tag","address","detour"}); the 1.12+
            // {"type","server"} form is rejected there and aborts the whole config.
            val remoteDns = JsonObject()
            remoteDns.addProperty("tag", "remote-dns")
            remoteDns.addProperty("address", "1.1.1.1")
            remoteDns.addProperty("detour", PROXY_TAG)
            val localDns = JsonObject()
            localDns.addProperty("tag", "direct-dns")
            localDns.addProperty("address", "local")
            val dnsServers = JsonArray()
            dnsServers.add(remoteDns)
            dnsServers.add(localDns)
            val dns = JsonObject()
            dns.add("servers", dnsServers)
            dns.addProperty("final", "remote-dns")
            config.add("dns", dns)

            val direct = JsonObject()
            direct.addProperty("type", "direct")
            direct.addProperty("tag", "direct")
            val outbounds = JsonArray()
            outbounds.add(outbound)
            outbounds.add(direct)
            config.add("outbounds", outbounds)

            val defaultRule = JsonObject()
            defaultRule.addProperty("outbound", PROXY_TAG)
            val rules = JsonArray()
            rules.add(defaultRule)
            val route = JsonObject()
            route.add("rules", rules)
            route.addProperty("final", PROXY_TAG)
            route.addProperty("auto_detect_interface", true)
            config.add("route", route)

            return config.toString()
        }

        /**
         * Maps the shared VpnServerConfig fields onto a sing-box outbound.
         * Returns null for anything that would be an unusable/invalid outbound.
         */
        private fun buildOutbound(
            server: JsonObject,
            protocol: String,
            host: String,
            port: Int
        ): JsonObject? {
            val outbound = JsonObject()

            when (protocol) {
                "shadowsocks" -> {
                    val method = server.stringOrNull("method")
                    val password = server.stringOrNull("password")
                    if (method.isNullOrBlank() || password.isNullOrBlank()) {
                        Log.e(TAG, "shadowsocks node is missing method/password")
                        return null
                    }
                    outbound.addProperty("type", "shadowsocks")
                    outbound.addProperty("method", method)
                    outbound.addProperty("password", password)
                }

                "vmess" -> {
                    val uuid = server.stringOrNull("uuid")
                    if (uuid.isNullOrBlank()) {
                        Log.e(TAG, "vmess node is missing uuid")
                        return null
                    }
                    outbound.addProperty("type", "vmess")
                    outbound.addProperty("uuid", uuid)
                    outbound.addProperty("security", "auto")
                    outbound.addProperty("alter_id", 0)
                    addTransport(outbound, server)
                    if (!addTls(outbound, server)) return null
                }

                "vless" -> {
                    val uuid = server.stringOrNull("uuid")
                    if (uuid.isNullOrBlank()) {
                        Log.e(TAG, "vless node is missing uuid")
                        return null
                    }
                    outbound.addProperty("type", "vless")
                    outbound.addProperty("uuid", uuid)
                    server.stringOrNull("flow")?.takeIf { it.isNotBlank() }
                        ?.let { outbound.addProperty("flow", it) }
                    addTransport(outbound, server)
                    if (!addTls(outbound, server)) return null
                }

                "trojan" -> {
                    val password = server.stringOrNull("password")
                    if (password.isNullOrBlank()) {
                        Log.e(TAG, "trojan node is missing password")
                        return null
                    }
                    val tlsMode = (server.stringOrNull("tls") ?: "none").lowercase()
                    if (tlsMode == "none") {
                        Log.e(TAG, "trojan node has no TLS")
                        return null
                    }
                    outbound.addProperty("type", "trojan")
                    outbound.addProperty("password", password)
                    addTransport(outbound, server)
                    if (!addTls(outbound, server)) return null
                }

                "hysteria2" -> {
                    val password = server.stringOrNull("password")
                    if (password.isNullOrBlank()) {
                        Log.e(TAG, "hysteria2 node is missing password")
                        return null
                    }
                    outbound.addProperty("type", "hysteria2")
                    outbound.addProperty("password", password)
                    if (!addTls(outbound, server, tlsRequired = true)) return null
                }

                "tuic" -> {
                    val uuid = server.stringOrNull("uuid")
                    if (uuid.isNullOrBlank()) {
                        Log.e(TAG, "tuic node is missing uuid")
                        return null
                    }
                    outbound.addProperty("type", "tuic")
                    outbound.addProperty("uuid", uuid)
                    server.stringOrNull("password")?.takeIf { it.isNotBlank() }
                        ?.let { outbound.addProperty("password", it) }
                    if (!addTls(outbound, server, tlsRequired = true)) return null
                }

                "wireguard" -> {
                    val privateKey = server.stringOrNull("privateKey")
                    val peerPublicKey = server.stringOrNull("peerPublicKey")
                    val addresses = server.stringList("address")
                    if (privateKey.isNullOrBlank() || peerPublicKey.isNullOrBlank() || addresses.isEmpty()) {
                        Log.e(TAG, "wireguard node is missing privateKey/peerPublicKey/address")
                        return null
                    }
                    outbound.addProperty("type", "wireguard")
                    outbound.addProperty("private_key", privateKey)
                    outbound.addProperty("peer_public_key", peerPublicKey)
                    server.stringOrNull("presharedKey")?.takeIf { it.isNotBlank() }
                        ?.let { outbound.addProperty("pre_shared_key", it) }
                    val localAddress = JsonArray()
                    addresses.forEach { localAddress.add(it) }
                    outbound.add("local_address", localAddress)
                    val mtu = server.intOrZero("mtu")
                    if (mtu in 576..9000) outbound.addProperty("mtu", mtu)
                }

                "socks5" -> {
                    outbound.addProperty("type", "socks")
                    server.stringOrNull("uuid")?.takeIf { it.isNotBlank() }
                        ?.let { outbound.addProperty("username", it) }
                    server.stringOrNull("password")?.takeIf { it.isNotBlank() }
                        ?.let { outbound.addProperty("password", it) }
                }

                "http" -> {
                    outbound.addProperty("type", "http")
                    server.stringOrNull("uuid")?.takeIf { it.isNotBlank() }
                        ?.let { outbound.addProperty("username", it) }
                    server.stringOrNull("password")?.takeIf { it.isNotBlank() }
                        ?.let { outbound.addProperty("password", it) }
                }

                else -> {
                    // e.g. openvpn: no sing-box outbound exists for it.
                    Log.e(TAG, "Unsupported protocol '$protocol' for the sing-box core")
                    return null
                }
            }

            outbound.addProperty("server", host)
            outbound.addProperty("server_port", port)
            return outbound
        }

        /**
         * Appends a sing-box `tls` block when the node asks for one.
         * Returns false when the node's TLS data is incomplete (for example
         * reality without publicKey) so the caller refuses to connect.
         */
        private fun addTls(
            outbound: JsonObject,
            server: JsonObject,
            tlsRequired: Boolean = false
        ): Boolean {
            var mode = (server.stringOrNull("tls") ?: "none").lowercase()
            if (tlsRequired && mode == "none") mode = "tls"
            if (mode == "none") return true

            val tls = JsonObject()
            tls.addProperty("enabled", true)

            val sni = server.stringOrNull("sni") ?: server.stringOrNull("host")
            if (!sni.isNullOrBlank()) tls.addProperty("server_name", sni)
            if (server.boolOrFalse("allowInsecure")) tls.addProperty("insecure", true)

            if (mode == "reality") {
                val publicKey = server.stringOrNull("publicKey")
                if (publicKey.isNullOrBlank()) {
                    Log.e(TAG, "reality node is missing publicKey")
                    return false
                }
                val reality = JsonObject()
                reality.addProperty("enabled", true)
                reality.addProperty("public_key", publicKey)
                server.stringOrNull("shortId")?.takeIf { it.isNotBlank() }
                    ?.let { reality.addProperty("short_id", it) }
                tls.add("reality", reality)
            }

            val fingerprint = server.stringOrNull("fingerprint")
            if (!fingerprint.isNullOrBlank()) {
                val utls = JsonObject()
                utls.addProperty("enabled", true)
                utls.addProperty("fingerprint", fingerprint)
                tls.add("utls", utls)
            }

            outbound.add("tls", tls)
            return true
        }

        /** ws / grpc / http / quic / kcp transport, skipped for plain tcp. */
        private fun addTransport(outbound: JsonObject, server: JsonObject) {
            val network = (server.stringOrNull("network") ?: "tcp").lowercase()
            if (network.isBlank() || network == "tcp") return

            val transport = JsonObject()
            when (network) {
                "ws" -> {
                    transport.addProperty("type", "ws")
                    server.stringOrNull("path")?.takeIf { it.isNotBlank() }
                        ?.let { transport.addProperty("path", it) }
                    val hostHeader = server.stringOrNull("host")
                    if (!hostHeader.isNullOrBlank()) {
                        val headers = JsonObject()
                        headers.addProperty("Host", hostHeader)
                        transport.add("headers", headers)
                    }
                }

                "grpc" -> {
                    transport.addProperty("type", "grpc")
                    server.stringOrNull("path")?.takeIf { it.isNotBlank() }
                        ?.let { transport.addProperty("service_name", it) }
                }

                "http" -> {
                    transport.addProperty("type", "http")
                    server.stringOrNull("path")?.takeIf { it.isNotBlank() }
                        ?.let { transport.addProperty("path", it) }
                    val hostHeader = server.stringOrNull("host")
                    if (!hostHeader.isNullOrBlank()) {
                        val hosts = JsonArray()
                        hosts.add(hostHeader)
                        transport.add("host", hosts)
                    }
                }

                "quic" -> transport.addProperty("type", "quic")

                "kcp" -> transport.addProperty("type", "kcp")

                else -> {
                    Log.w(TAG, "Unknown network '$network'; keeping the default transport")
                    return
                }
            }
            outbound.add("transport", transport)
        }

        private const val PROXY_TAG = "proxy"
    }

    private var vpnInterface: ParcelFileDescriptor? = null
    private var coreProcess: Process? = null
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var activeJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == null) {
            // No redelivered payload: a restart could not rebuild the tunnel, so
            // never ask the OS for one.
            Log.w(TAG, "onStartCommand without an action; staying down")
            return START_NOT_STICKY
        }

        when (action) {
            ACTION_CONNECT -> {
                val serverJson = intent.getStringExtra(EXTRA_SERVER_JSON)
                if (serverJson.isNullOrBlank()) {
                    refuseConnect("ACTION_CONNECT without $EXTRA_SERVER_JSON - refusing to connect")
                    return START_NOT_STICKY
                }
                startVpn(serverJson)
            }

            ACTION_DISCONNECT -> stopVpn()
        }

        // Deliberately not sticky: isRunning is only true while this instance owns
        // the TUN fd and the sing-box child process. After a process kill the
        // honest state is DISCONNECTED, not a phantom "Connected".
        return START_NOT_STICKY
    }

    /**
     * Leaves the service without ever raising a tunnel. The foreground step is
     * required because a refused connect can be reached from a
     * startForegroundService() start (the Quick Settings tile); without it
     * Android O+ raises ForegroundServiceDidNotStartInTimeException.
     */
    private fun refuseConnect(reason: String) {
        Log.e(TAG, reason)
        try {
            startForeground(
                NOTIFICATION_ID,
                buildForegroundNotification("RYOX VPN", "No usable node - stayed disconnected")
            )
        } catch (e: Exception) {
            Log.w(TAG, "startForeground during refusal failed: ${e.message}")
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun startVpn(serverJson: String) {
        if (isRunning) return

        val configJson = buildSingBoxConfig(serverJson)
        if (configJson == null) {
            // No valid outbound for this node: never raise the tunnel or the
            // "Connected" notification; the caller surfaces the error instead.
            refuseConnect("No valid sing-box outbound for this node; not connecting")
            return
        }

        val serverName = readServerName(serverJson)
        val notification = buildForegroundNotification(
            "Connected to $serverName",
            "Tunnel negotiated by sing-box"
        )
        try {
            startForeground(NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            // e.g. ForegroundServiceStartNotAllowedException: leave nothing behind
            // that could report Connected.
            Log.e(TAG, "startForeground failed: ${e.message}", e)
            stopVpn()
            return
        }

        try {
            val coreStarted = startSingBoxCore(configJson)

            val builder = Builder()
                .setSession("RYOX VPN")
                .setMtu(1500)
                .addAddress("172.19.0.1", 30)
                .addDnsServer("1.1.1.1")
                .addDnsServer("8.8.8.8")
                .setBlocking(false)

            // Keep RYOX VPN's own traffic out of its own tunnel.
            try {
                builder.addDisallowedApplication(packageName)
            } catch (e: Exception) {
                Log.w(TAG, "addDisallowedApplication failed: ${e.message}")
            }

            // The functional path: point apps' HTTP/SOCKS proxy at the local
            // sing-box mixed inbound (API 29+). Loopback is never tunnelled, so
            // this keeps working regardless of the TUN route decision below.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    val proxy = ProxyInfo.buildDirectProxy("127.0.0.1", MIXED_INBOUND_PORT)
                    builder.setHttpProxy(proxy)
                    builder.setMetered(false)
                } catch (e: Exception) {
                    Log.w(TAG, "setHttpProxy failed: ${e.message}")
                }
            }

            // No IPv6 route is ever added: this interface carries no IPv6 address,
            // so a v6 default route would black-hole IPv6 instead of tunnelling it.
            if (CAPTURE_ALL_TRAFFIC_IN_TUN) {
                builder.addRoute("0.0.0.0", 0)
            }

            val fd = builder.establish()
            if (fd == null) {
                // establish() returns null when consent was revoked or another VPN
                // is already active. Roll everything back so the UI cannot claim
                // Connected and startVpn's guard cannot block later attempts.
                Log.e(TAG, "builder.establish() returned null - VPN interface not created")
                stopVpn()
                return
            }

            vpnInterface = fd
            markSessionStarted(applicationInfo.uid)
            isRunning = true
            Log.i(TAG, "TUN established (fd=${fd.fd}), coreStarted=$coreStarted")

            activeJob = serviceScope.launch(Dispatchers.Main) {
                while (isActive && isRunning) {
                    delay(1000)
                    val core = coreProcess
                    if (core == null || !core.isAlive) {
                        // Never keep reporting Connected for a dead core.
                        Log.e(TAG, "sing-box core is gone - tearing the tunnel down")
                        stopVpn()
                        break
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to establish VPN interface: ${e.message}", e)
            stopVpn()
        }
    }

    /** Writes the generated config and launches the bundled core. */
    private fun startSingBoxCore(configJson: String): Boolean {
        val libFile = File(applicationInfo.nativeLibraryDir, "libsingbox.so")
        if (!libFile.exists()) {
            Log.e(TAG, "libsingbox.so not found at ${libFile.absolutePath}")
            return false
        }

        return try {
            val configFile = File(filesDir, "singbox.json")
            configFile.writeText(configJson)

            // Redirect to a file: an unread pipe would eventually fill up and
            // block the core process.
            val logFile = File(filesDir, "singbox.log")
            val process = ProcessBuilder(libFile.absolutePath, "run", "-c", configFile.absolutePath)
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.appendTo(logFile))
                .start()

            coreProcess = process
            Log.i(TAG, "sing-box core started (pid=${processPid(process)})")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error starting sing-box core: ${e.message}", e)
            false
        }
    }

    /**
     * `Process.pid()` only exists from Android API 36, so read the field the
     * implementation exposes and fall back to a placeholder when it is absent.
     */
    private fun processPid(process: Process): String {
        return try {
            val field = process.javaClass.getDeclaredField("pid")
            field.isAccessible = true
            (field.get(process) as? Number)?.toString() ?: "unknown"
        } catch (e: Exception) {
            "unknown"
        }
    }

    private fun readServerName(serverJson: String): String {
        return try {
            val parsed = JsonParser.parseString(serverJson)
            if (parsed.isJsonObject) {
                parsed.asJsonObject.stringOrNull("name") ?: "RYOX Secure Node"
            } else {
                "RYOX Secure Node"
            }
        } catch (e: Exception) {
            "RYOX Secure Node"
        }
    }

    private fun stopVpn() {
        Log.i(TAG, "Stopping RYOX VpnService...")
        isRunning = false
        activeJob?.cancel()
        activeJob = null

        try {
            coreProcess?.destroyForcibly()
        } catch (_: Exception) {}
        coreProcess = null

        try {
            vpnInterface?.close()
        } catch (_: Exception) {}
        vpnInterface = null

        clearSession()

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopVpn()
        serviceScope.cancel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "RYOX VPN Connection",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows live connection state and encryption status"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(title: String, text: String): Notification {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_vpn_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }
}

private fun JsonObject.stringOrNull(key: String): String? {
    val element = get(key) ?: return null
    if (element.isJsonNull) return null
    return try {
        element.asString
    } catch (_: Exception) {
        null
    }
}

private fun JsonObject.intOrZero(key: String): Int {
    val element = get(key) ?: return 0
    if (element.isJsonNull) return 0
    return try {
        element.asInt
    } catch (_: Exception) {
        0
    }
}

private fun JsonObject.boolOrFalse(key: String): Boolean {
    val element = get(key) ?: return false
    if (element.isJsonNull) return false
    return try {
        element.asBoolean
    } catch (_: Exception) {
        false
    }
}

private fun JsonObject.stringList(key: String): List<String> {
    val element = get(key) ?: return emptyList()
    if (!element.isJsonArray) return emptyList()
    return try {
        element.asJsonArray.mapNotNull { item ->
            if (item.isJsonPrimitive) item.asString else null
        }
    } catch (_: Exception) {
        emptyList()
    }
}
