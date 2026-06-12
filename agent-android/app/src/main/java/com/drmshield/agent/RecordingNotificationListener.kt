package com.drmshield.agent

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Optional live-recording detector.
 *
 * When the user grants Notification access (Settings → Notification access →
 * DRMShield Agent), Android delivers every posted notification to this service.
 * Screen-recorder apps and the system recorder post an ongoing "recording" /
 * "casting" notification while capture is active, so the presence of such a
 * notification is a strong "recording in progress" signal — the closest a normal
 * app can get to a system recording callback.
 *
 * The detected app label is exposed via [activeRecordingApp]; RecorderDetector
 * folds it into the /status threats. If the user never grants access, this service
 * simply never runs and detection falls back to installed-app + cast signals.
 */
class RecordingNotificationListener : NotificationListenerService() {

    override fun onListenerConnected() {
        recompute(activeNotifications)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        recompute(activeNotifications)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        recompute(activeNotifications)
    }

    private fun recompute(active: Array<StatusBarNotification>?) {
        if (active == null) {
            activeRecordingApp = null
            return
        }
        for (sbn in active) {
            val extras = sbn.notification?.extras ?: continue
            val title = extras.getCharSequence("android.title")?.toString()?.lowercase().orEmpty()
            val text = extras.getCharSequence("android.text")?.toString()?.lowercase().orEmpty()
            if (RECORDING_PHRASES.any { it in title || it in text }) {
                activeRecordingApp = labelFor(sbn.packageName)
                return
            }
        }
        activeRecordingApp = null
    }

    private fun labelFor(pkg: String): String = pkg

    companion object {
        /** Set while a recording/casting notification is active; null otherwise. */
        @Volatile
        var activeRecordingApp: String? = null
            private set

        private val RECORDING_PHRASES = listOf(
            "screen recording",
            "recording screen",
            "is recording",
            "casting",
            "screen cast",
            "screen capture",
        )
    }
}
