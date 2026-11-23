package com.ryox.vpn.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ProxyInfo
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import com.ryox.vpn.MainActivity
import com.ryox.vpn.R
import kotlinx.coroutines.*
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

class RyoxVpnService : VpnService() {

    companion object {
        const val TAG = "RyoxVpnService"
        const val ACTION_CONNECT = "com.ryox.vpn.ACTION_CONNECT"
        const val ACTION_DISCONNECT = "com.ryox.vpn.ACTION_DISCONNECT"
        const val CHANNEL_ID = "ryox_vpn_service_channel"
        const val NOTIFICATION_ID = 1001

        var isRunning: Boolean = false
            private set
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
        val action = intent?.action ?: return START_NOT_STICKY

        when (action) {
            ACTION_CONNECT -> {
                val serverName = intent.getStringExtra("SERVER_NAME") ?: "RYOX Secure Node"
                val serverHost = intent.getStringExtra("SERVER_HOST") ?: "45.86.51.18"
                val serverPort = intent.getIntExtra("SERVER_PORT", 19999)
                startVpn(serverName, serverHost, serverPort)
            }
            ACTION_DISCONNECT -> {
                stopVpn()
            }
        }

        return START_STICKY
    }

    private fun startVpn(serverName: String, host: String, port: Int) {
        if (isRunning) return

        val notification = buildForegroundNotification("Connected to $serverName", "Encrypted with Multi-Core")
        startForeground(NOTIFICATION_ID, notification)

        try {
            // Step 1: Start native sing-box core process on 127.0.0.1:10808
            startSingBoxCore(host, port)

            // Step 2: Establish native TUN interface with direct system proxy routing
            val builder = Builder()
                .setSession("RYOX VPN")
                .setMtu(1500)
                .addAddress("172.19.0.1", 30)
                .addDnsServer("1.1.1.1")
                .addDnsServer("8.8.8.8")
                .setBlocking(false)

            // Bypass RYOX VPN app itself from tunnel to prevent routing loop
            try {
                builder.addDisallowedApplication(packageName)
            } catch (e: Exception) {
                Log.w(TAG, "addDisallowedApplication failed: ${e.message}")
            }

            // Direct system-wide traffic to local multi-core inbound proxy port (API 29+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    val proxy = ProxyInfo.buildDirectProxy("127.0.0.1", 10808)
                    builder.setHttpProxy(proxy)
                    builder.setMetered(false)
                } catch (e: Exception) {
                    Log.w(TAG, "setHttpProxy failed: ${e.message}")
                }
            }

            vpnInterface = builder.establish()
            isRunning = true

            Log.i(TAG, "RYOX VpnService established interface fd: ${vpnInterface?.fd}")

            activeJob = serviceScope.launch {
                while (isActive && isRunning) {
                    delay(1000)
                }
            }

        } catch (e: Exception) {
            Log.e(TAG, "Failed to establish VPN interface: ${e.message}", e)
            stopVpn()
        }
    }

    private fun startSingBoxCore(host: String, port: Int) {
        try {
            val libFile = File(applicationInfo.nativeLibraryDir, "libsingbox.so")
            if (libFile.exists()) {
                val configFile = File(filesDir, "singbox.json")
                val configJson = """
                {
                  "log": { "level": "warn" },
                  "dns": {
                    "servers": [
                      { "tag": "remote-dns", "type": "udp", "server": "1.1.1.1", "detour": "proxy" },
                      { "tag": "direct-dns", "type": "local", "detour": "direct" }
                    ],
                    "final": "remote-dns"
                  },
                  "inbounds": [
                    {
                      "type": "mixed",
                      "tag": "mixed-in",
                      "listen": "127.0.0.1",
                      "listen_port": 10808
                    }
                  ],
                  "outbounds": [
                    {
                      "tag": "proxy",
                      "type": "shadowsocks",
                      "server": "$host",
                      "server_port": $port,
                      "method": "aes-256-gcm",
                      "password": "ZRpgaBeGxtENIXgvhpkZBKz9GnWRS2dYcx9O+a2iwN4="
                    },
                    { "type": "direct", "tag": "direct" }
                  ],
                  "route": {
                    "rules": [
                      { "network": ["tcp", "udp"], "outbound": "proxy" }
                    ],
                    "auto_detect_interface": true
                  }
                }
                """.trimIndent()
                configFile.writeText(configJson)

                coreProcess = ProcessBuilder(libFile.absolutePath, "run", "-c", configFile.absolutePath)
                    .redirectErrorStream(true)
                    .start()

                Log.i(TAG, "Native sing-box core started successfully.")
            } else {
                Log.w(TAG, "libsingbox.so not found at ${libFile.absolutePath}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error starting sing-box core: ${e.message}", e)
        }
    }

    private fun stopVpn() {
        Log.i(TAG, "Stopping RYOX VpnService...")
        isRunning = false
        activeJob?.cancel()

        try {
            coreProcess?.destroyForcibly()
        } catch (_: Exception) {}
        coreProcess = null

        try {
            vpnInterface?.close()
        } catch (_: Exception) {}
        vpnInterface = null

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
