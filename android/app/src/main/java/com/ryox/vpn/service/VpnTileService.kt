package com.ryox.vpn.service

import android.content.Intent
import android.graphics.drawable.Icon
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.ryox.vpn.R

class VpnTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        updateTileState()
    }

    override fun onClick() {
        super.onClick()
        val tile = qsTile ?: return

        if (RyoxVpnService.isRunning) {
            val intent = Intent(this, RyoxVpnService::class.java).apply {
                action = RyoxVpnService.ACTION_DISCONNECT
            }
            startService(intent)
        } else {
            val intent = Intent(this, RyoxVpnService::class.java).apply {
                action = RyoxVpnService.ACTION_CONNECT
                putExtra("SERVER_NAME", "Quick Connect Node")
                putExtra("SERVER_HOST", "us1.edge.ryoxvpn.org")
                putExtra("SERVER_PORT", 443)
            }
            startService(intent)
        }

        updateTileState()
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
