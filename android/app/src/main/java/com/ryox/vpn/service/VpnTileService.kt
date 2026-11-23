package com.ryox.vpn.service

import android.app.PendingIntent
import android.content.Intent
import android.content.SharedPreferences
import android.net.VpnService
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.google.gson.JsonObject
import com.google.gson.JsonParser

class VpnTileService : TileService() {

    companion object {
        private const val TAG = "VpnTileService"
        private const val PREFS_NAME = "ryox_vpn_prefs"
    }

    override fun onStartListening() {
        super.onStartListening()
        updateTileState()
    }

    override fun onClick() {
        super.onClick()

        if (RyoxVpnService.isRunning) {
            stopTunnel()
        } else {
            connectTunnel()
        }

        updateTileState()
    }

    /**
     * The tile only ever dials a node the app has genuinely saved: there is no
     * invented fallback server, so a fresh install stays disconnected.
     */
    private fun connectTunnel() {
        val serverJson = selectedServerJson()
        if (serverJson == null) {
            Toast.makeText(this, "Open RYOX VPN once so a node can be selected", Toast.LENGTH_LONG).show()
            return
        }

        if (RyoxVpnService.buildSingBoxConfig(serverJson) == null) {
            Toast.makeText(this, "The selected node is incomplete; open RYOX VPN", Toast.LENGTH_LONG).show()
            return
        }

        val consent = VpnService.prepare(this)
        if (consent != null) {
            // Without this the tile flipped to "Connected" with no tunnel at all.
            requestVpnConsent(consent)
            Toast.makeText(this, "Allow the VPN request, then tap RYOX again", Toast.LENGTH_LONG).show()
            return
        }

        val intent = Intent(this, RyoxVpnService::class.java).apply {
            action = RyoxVpnService.ACTION_CONNECT
            putExtra(RyoxVpnService.EXTRA_SERVER_JSON, serverJson)
        }
        try {
            // A tile click is a background start on Android O+, where plain
            // startService can throw IllegalStateException. The service validates
            // the node and calls startForeground immediately afterwards.
            ContextCompat.startForegroundService(this, intent)
        } catch (e: Exception) {
            Log.e(TAG, "startForegroundService failed: ${e.message}", e)
            Toast.makeText(this, "Could not start the VPN service", Toast.LENGTH_LONG).show()
        }
    }

    private fun stopTunnel() {
        if (!RyoxVpnService.isRunning) return

        val intent = Intent(this, RyoxVpnService::class.java).apply {
            action = RyoxVpnService.ACTION_DISCONNECT
        }
        // The tunnel's own foreground service keeps the app out of the background
        // start restriction, so a plain startService is enough here and avoids the
        // "must call startForeground" contract that the disconnect path never meets.
        try {
            startService(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Stopping the service failed: ${e.message}", e)
        }
    }

    private fun requestVpnConsent(consent: Intent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // startActivityAndCollapse(Intent) throws UnsupportedOperationException
                // for apps targeting API 34+; the PendingIntent overload is the
                // supported replacement.
                val pending = PendingIntent.getActivity(
                    this,
                    0,
                    consent,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
                startActivityAndCollapse(pending)
            } else {
                @Suppress("DEPRECATION")
                startActivityAndCollapse(consent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Unable to show the VPN consent dialog: ${e.message}", e)
        }
    }

    /**
     * The last selected saved node (settings.selectedServerId), else the first
     * saved node, serialised back to the VpnServerConfig JSON the service expects.
     */
    private fun selectedServerJson(): String? {
        return try {
            val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            val listJson = prefs.getString("servers_list", null)
            if (listJson.isNullOrBlank()) {
                null
            } else {
                val parsed = JsonParser.parseString(listJson)
                if (!parsed.isJsonArray) {
                    null
                } else {
                    val servers = parsed.asJsonArray
                        .filter { it.isJsonObject }
                        .map { it.asJsonObject }
                    if (servers.isEmpty()) {
                        null
                    } else {
                        val selectedId = readSelectedServerId(prefs)
                        val chosen = servers.firstOrNull { it.idOrNull() == selectedId }
                            ?: servers.first()
                        chosen.toString()
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Could not read the saved server list: ${e.message}", e)
            null
        }
    }

    private fun readSelectedServerId(prefs: SharedPreferences): String? {
        return try {
            val settingsJson = prefs.getString("settings", null) ?: return null
            val parsed = JsonParser.parseString(settingsJson)
            if (!parsed.isJsonObject) return null
            val element = parsed.asJsonObject.get("selectedServerId") ?: return null
            if (element.isJsonPrimitive) element.asString else null
        } catch (e: Exception) {
            null
        }
    }

    private fun JsonObject.idOrNull(): String? {
        val element = get("id") ?: return null
        return if (element.isJsonPrimitive) element.asString else null
    }

    private fun updateTileState() {
        val tile = qsTile ?: return
        if (RyoxVpnService.isRunning) {
            tile.state = Tile.STATE_ACTIVE
            tile.label = "RYOX (Connected)"
        } else {
            tile.state = Tile.STATE_INACTIVE
            tile.label = "RYOX (Disconnected)"
        }
        tile.updateTile()
    }
}
