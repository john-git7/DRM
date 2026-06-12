package com.drmshield.agent

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Tiny control surface for the agent: start/stop the detection service, request the
 * notification permission (Android 13+), and deep-link to Notification access so the
 * optional live-recording detector can be enabled.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        status = findViewById(R.id.statusText)
        val startBtn = findViewById<Button>(R.id.startButton)
        val stopBtn = findViewById<Button>(R.id.stopButton)
        val notifAccessBtn = findViewById<Button>(R.id.notifAccessButton)

        startBtn.setOnClickListener {
            ensureNotificationPermission()
            AgentService.start(this)
            status.text = getString(R.string.status_running)
        }
        stopBtn.setOnClickListener {
            AgentService.stop(this)
            status.text = getString(R.string.status_stopped)
        }
        notifAccessBtn.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
    }

    /** Foreground services on Android 13+ need POST_NOTIFICATIONS to show their notice. */
    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                1,
            )
        }
    }
}
