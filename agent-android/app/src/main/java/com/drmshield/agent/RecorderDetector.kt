package com.drmshield.agent

import android.content.Context
import android.hardware.display.DisplayManager
import android.view.Display
import org.json.JSONArray
import org.json.JSONObject

/**
 * Recorder / capture detection for Android, scoped to what a normal (non-DRM,
 * non-root) app can honestly observe.
 *
 * Honest scope
 * ------------
 * Android exposes NO public API that notifies an arbitrary app when *another* app
 * starts screen recording — MediaProjection callbacks fire only for projections
 * your own app created. So this detector combines the signals that DO work:
 *
 *   1. Installed known-recorder packages (PackageManager). A presence signal: it
 *      proves a recorder is available on the device, the same posture the desktop
 *      agent takes toward installed downloader/recorder tooling.
 *   2. Active screen mirroring / casting (DisplayManager). A live signal: a
 *      non-default, on Display means the screen is being mirrored to a TV/cast/
 *      capture sink.
 *   3. An active system "screen recording" notification, supplied by the optional
 *      RecordingNotificationListener when the user has granted notification access.
 *      This is the closest thing to a live "recording in progress" signal.
 *
 * For stronger live detection an AccessibilityService (observing the recorder app's
 * windows and the system capture indicator) is the usual RASP route; it is left as
 * a documented extension in the README to keep this build's permission surface small.
 */
class RecorderDetector(private val context: Context) {

    data class Threat(val category: String, val name: String)

    /** Known screen-recorder package ids, loaded from assets/recorders.json. */
    private val recorderPackages: List<RecorderSig> by lazy { loadSignatures() }

    private data class RecorderSig(val name: String, val packages: List<String>)

    /** Run every signal and collect the threats found (empty list == clean). */
    fun scan(): List<Threat> {
        val threats = mutableListOf<Threat>()
        threats += scanInstalledRecorders()
        threats += scanActiveMirroring()
        RecordingNotificationListener.activeRecordingApp?.let {
            threats += Threat("Active screen recording", it)
        }
        return threats
    }

    /** Known recorder apps that are installed on the device. */
    private fun scanInstalledRecorders(): List<Threat> {
        val pm = context.packageManager
        val out = mutableListOf<Threat>()
        for (sig in recorderPackages) {
            for (pkg in sig.packages) {
                val installed = try {
                    pm.getPackageInfo(pkg, 0)
                    true
                } catch (e: Exception) {
                    false
                }
                if (installed) {
                    out += Threat("Screen recorder (installed)", sig.name)
                    break
                }
            }
        }
        return out
    }

    /** Secondary / mirrored displays indicate casting or HDMI capture. */
    private fun scanActiveMirroring(): List<Threat> {
        val dm = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        val out = mutableListOf<Threat>()
        for (display in dm.displays) {
            // The built-in panel is DEFAULT_DISPLAY; anything else on and valid is
            // an external/virtual sink the frame is being pushed to.
            if (display.displayId != Display.DEFAULT_DISPLAY && display.state == Display.STATE_ON) {
                out += Threat("Screen mirroring / cast", display.name ?: "External display")
            }
        }
        return out
    }

    private fun loadSignatures(): List<RecorderSig> {
        return try {
            val json = context.assets.open("recorders.json").bufferedReader().use { it.readText() }
            val arr = JSONArray(json)
            (0 until arr.length()).map { i ->
                val o: JSONObject = arr.getJSONObject(i)
                val pkgs = o.getJSONArray("packages")
                RecorderSig(
                    name = o.getString("name"),
                    packages = (0 until pkgs.length()).map { pkgs.getString(it) },
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }
}
