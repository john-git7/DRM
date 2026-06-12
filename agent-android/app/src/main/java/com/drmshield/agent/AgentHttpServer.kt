package com.drmshield.agent

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/**
 * Minimal loopback HTTP server implementing the same contract the DRMShield web
 * player already polls for the desktop agent:
 *
 *   GET  /status  -> 200 JSON { agent info, threats[], clean:boolean }
 *   GET  /health  -> 200 { "ok": true }
 *   OPTIONS *      -> 204 with CORS + Private-Network-Access headers (preflight)
 *   *              -> 404 { "error": "not found" }
 *
 * Bound to 127.0.0.1 only, so it is reachable from the browser running on the same
 * device but not from the network. Built on java.net.ServerSocket — no third-party
 * HTTP library, mirroring the stdlib-only desktop agent.
 *
 * CORS / Private Network Access: an https web page fetching http://127.0.0.1 is a
 * "private network" request. Chrome sends a preflight with
 * `Access-Control-Request-Private-Network: true`; we must echo
 * `Access-Control-Allow-Private-Network: true` or the fetch is blocked. We also
 * allow the player origin (or `*`) for the actual GET.
 */
class AgentHttpServer(
    private val context: Context,
    private val port: Int = 7891,
    private val allowedOrigin: String = "*",
) {
    private val detector = RecorderDetector(context)
    @Volatile private var serverSocket: ServerSocket? = null
    @Volatile private var running = false

    fun start() {
        if (running) return
        running = true
        thread(name = "drmshield-agent-http", isDaemon = true) {
            try {
                // Loopback bind, small backlog — this only ever serves the local browser.
                val socket = ServerSocket(port, 8, InetAddress.getByName("127.0.0.1"))
                serverSocket = socket
                Log.i(TAG, "Agent HTTP server listening on 127.0.0.1:$port")
                while (running) {
                    val client = try {
                        socket.accept()
                    } catch (e: Exception) {
                        if (running) Log.w(TAG, "accept failed: ${e.message}")
                        break
                    }
                    // One short-lived thread per connection; requests are tiny.
                    thread(isDaemon = true) { handle(client) }
                }
            } catch (e: Exception) {
                Log.e(TAG, "server error: ${e.message}")
            } finally {
                running = false
            }
        }
    }

    fun stop() {
        running = false
        try {
            serverSocket?.close()
        } catch (_: Exception) {
        }
        serverSocket = null
    }

    private fun handle(client: Socket) {
        client.use { sock ->
            try {
                val reader = BufferedReader(InputStreamReader(sock.getInputStream()))
                val requestLine = reader.readLine() ?: return
                // Drain remaining headers (we don't need bodies; all routes are GET/OPTIONS).
                while (true) {
                    val line = reader.readLine() ?: break
                    if (line.isEmpty()) break
                }

                val parts = requestLine.split(" ")
                val method = parts.getOrNull(0) ?: ""
                val path = parts.getOrNull(1)?.substringBefore('?') ?: "/"
                val out = sock.getOutputStream()

                when {
                    method == "OPTIONS" -> writePreflight(out)
                    method == "GET" && path == "/health" ->
                        writeJson(out, 200, JSONObject().put("ok", true).toString())
                    method == "GET" && path == "/status" ->
                        writeJson(out, 200, buildStatus())
                    else ->
                        writeJson(out, 404, JSONObject().put("error", "not found").toString())
                }
            } catch (e: Exception) {
                Log.w(TAG, "request handling failed: ${e.message}")
            }
        }
    }

    /** Build the /status payload in the shape the web player's checkAgent expects. */
    private fun buildStatus(): String {
        val threats = detector.scan()
        val threatArr = JSONArray()
        for (t in threats) {
            threatArr.put(JSONObject().put("category", t.category).put("name", t.name))
        }
        return JSONObject()
            .put("agent", "DRMShield Android Agent")
            .put("version", BuildVersion.VERSION)
            .put("platform", "android")
            .put("threats", threatArr)
            .put("clean", threats.isEmpty())
            .toString()
    }

    private fun corsHeaders(sb: StringBuilder) {
        sb.append("Access-Control-Allow-Origin: ").append(allowedOrigin).append("\r\n")
        sb.append("Access-Control-Allow-Methods: GET, OPTIONS\r\n")
        sb.append("Access-Control-Allow-Headers: *\r\n")
        // Required so an https page may reach this loopback (private network) server.
        sb.append("Access-Control-Allow-Private-Network: true\r\n")
        sb.append("Cache-Control: no-store\r\n")
    }

    private fun writePreflight(out: OutputStream) {
        val sb = StringBuilder("HTTP/1.1 204 No Content\r\n")
        corsHeaders(sb)
        sb.append("Content-Length: 0\r\n\r\n")
        out.write(sb.toString().toByteArray(Charsets.UTF_8))
        out.flush()
    }

    private fun writeJson(out: OutputStream, status: Int, body: String) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        val sb = StringBuilder("HTTP/1.1 ").append(status).append(' ')
            .append(if (status == 200) "OK" else if (status == 404) "Not Found" else "OK").append("\r\n")
        sb.append("Content-Type: application/json\r\n")
        corsHeaders(sb)
        sb.append("Content-Length: ").append(bytes.size).append("\r\n\r\n")
        out.write(sb.toString().toByteArray(Charsets.UTF_8))
        out.write(bytes)
        out.flush()
    }

    companion object {
        private const val TAG = "DRMShieldAgent"
    }
}

/** Single source of truth for the agent version string. */
object BuildVersion {
    const val VERSION = "1.0.0"
}
