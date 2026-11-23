package com.ryox.vpn

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.ryox.vpn.service.RyoxVpnService

class MainActivity : AppCompatActivity() {

    private lateinit var statusText: TextView
    private lateinit var connectButton: Button

    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            startVpnService()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.tv_status)
        connectButton = findViewById(R.id.btn_connect)

        connectButton.setOnClickListener {
            if (RyoxVpnService.isRunning) {
                stopVpnService()
            } else {
                prepareAndConnect()
            }
        }

        updateUi()
    }

    override fun onResume() {
        super.onResume()
        updateUi()
    }

    private fun prepareAndConnect() {
        val intent = VpnService.prepare(this)
        if (intent != null) {
            vpnPermissionLauncher.launch(intent)
        } else {
            startVpnService()
        }
    }

    private fun startVpnService() {
        val intent = Intent(this, RyoxVpnService::class.java).apply {
            action = RyoxVpnService.ACTION_CONNECT
            putExtra("SERVER_NAME", "US - High-Speed Reality")
            putExtra("SERVER_HOST", "us1.edge.ryoxvpn.org")
            putExtra("SERVER_PORT", 443)
        }
        startService(intent)
        updateUi()
    }

    private fun stopVpnService() {
        val intent = Intent(this, RyoxVpnService::class.java).apply {
            action = RyoxVpnService.ACTION_DISCONNECT
        }
        startService(intent)
        updateUi()
    }

    private fun updateUi() {
        if (RyoxVpnService.isRunning) {
            statusText.text = "STATUS: CONNECTED"
            connectButton.text = "DISCONNECT"
        } else {
            statusText.text = "STATUS: DISCONNECTED"
            connectButton.text = "TAP TO CONNECT"
        }
    }
}
