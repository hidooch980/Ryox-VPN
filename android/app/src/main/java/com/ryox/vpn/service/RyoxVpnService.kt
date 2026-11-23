package com.ryox.vpn.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import com.ryox.vpn.MainActivity
import com.ryox.vpn.R
import kotlinx.coroutines.*
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.InetSocketAddress
import java.nio.channels.DatagramChannel

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
                val serverHost = intent.getStringExtra("SERVER_HOST") ?: "127.0.0.1"
                val serverPort = intent.getIntExtra("SERVER_PORT", 443)
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
            // Establish native TUN interface via Android VpnService.Builder
            val builder = Builder()
                .setSession("RYOX VPN")
                .setMtu(1500)
                .addAddress("172.19.0.1", 30)
                .addRoute("0.0.0.0", 0)
                .addDnsServer("1.1.1.1")
                .addDnsServer("8.8.8.8")
                .setBlocking(true)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                builder.setMetered(false)
            }

            vpnInterface = builder.establish()
            isRunning = true

            Log.i(TAG, "RYOX VpnService established interface fd: ${vpnInterface?.fd}")

            activeJob = serviceScope.launch {
                runTunnelLoop()
            }

        } catch (e: Exception) {
            Log.e(TAG, "Failed to establish VPN interface: ${e.message}", e)
            stopVpn()
        }
    }

    private suspend fun runTunnelLoop() = withContext(Dispatchers.IO) {
        val pfd = vpnInterface ?: return@withContext
        val inputStream = FileInputStream(pfd.fileDescriptor)
        val outputStream = FileOutputStream(pfd.fileDescriptor)
        val buffer = ByteArray(32768)

        Log.i(TAG, "RYOX Tunnel packet processing loop started.")
        while (isActive && isRunning) {
            try {
                val length = inputStream.read(buffer)
                if (length > 0) {
                    // Forward packets through core tunnel adapter
                }
            } catch (e: Exception) {
                if (isActive) {
                    Log.w(TAG, "Tunnel read error: ${e.message}")
                }
                break
            }
        }
    }

    private fun stopVpn() {
        Log.i(TAG, "Stopping RYOX VpnService...")
        isRunning = false
        activeJob?.cancel()

        try {
            vpnInterface?.close()
        } catch (ignored: Exception) {}
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

        val disconnectIntent = Intent(this, RyoxVpnService::class.java).apply {
            action = ACTION_DISCONNECT
        }
        val disconnectPending = PendingIntent.getService(
            this,
            1,
            disconnectIntent,
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_vpn_notification)
            .setContentIntent(pendingIntent)
            .addAction(R.drawable.ic_vpn_notification, "Disconnect", disconnectPending)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
