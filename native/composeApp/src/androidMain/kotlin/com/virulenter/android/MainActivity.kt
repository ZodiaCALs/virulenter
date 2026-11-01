package com.virulenter.android

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import com.virulenter.APP_VERSION
import com.virulenter.model.AppState
import com.virulenter.model.Dates
import com.virulenter.platform.Notifications
import com.virulenter.platform.Platform
import com.virulenter.ui.App
import kotlinx.datetime.TimeZone
import java.io.File

class MainActivity : ComponentActivity() {
    private lateinit var platform: AndroidPlatform

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        Graph.init(this)
        platform = AndroidPlatform(this)
        handle(intent)
        setContent {
            App(Graph.controller, platform, onDark = { dark -> bars(dark) })
        }
    }

    /* status and navigation bar icons follow the app's theme, not only the system's */
    private fun bars(dark: Boolean) {
        val style = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }

    override fun onResume() {
        super.onResume()
        Dates.zone = TimeZone.currentSystemDefault()
        platform.refresh()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        val c = Graph.controller
        when (intent?.action) {
            ACTION_TAP -> {
                val e = c.store.current.event(intent.getStringExtra(TapReceiver.EXTRA_ID)) ?: return
                c.tap(e)
                intent.action = null
            }
            Intent.ACTION_SEND -> {
                intent.getStringExtra(Intent.EXTRA_TEXT)?.takeIf { it.isNotBlank() }?.let { c.openImport(it) }
                intent.action = null
            }
        }
    }

    companion object {
        const val ACTION_TAP = "com.virulenter.action.SHORTCUT_TAP"
    }
}

/* What the shared UI needs from Android: clipboard, the document picker for
   backups, and notification permissions. */
class AndroidPlatform(private val activity: ComponentActivity) : Platform {
    override val kind = Platform.Kind.Android
    override val version = APP_VERSION

    private var pendingSave: String? = null
    private var asked = false
    private var pendingOpen: ((String) -> Unit)? = null

    private val saveLauncher = activity.registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val text = pendingSave
        pendingSave = null
        if (uri != null && text != null) {
            runCatching { activity.contentResolver.openOutputStream(uri)?.use { it.write(text.encodeToByteArray()) } }
                .onSuccess { Graph.controller.say("Backup saved") }
                .onFailure { Graph.controller.say("Could not save the backup") }
        }
    }

    private val openLauncher = activity.registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val done = pendingOpen
        pendingOpen = null
        if (uri != null && done != null) {
            runCatching { activity.contentResolver.openInputStream(uri)?.use { it.readBytes().decodeToString() } }
                .getOrNull()?.let(done)
        }
    }

    private val permissionLauncher = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { refresh() }

    /* the system photo picker: no storage permission needed */
    private var pendingImage: ((ByteArray) -> Unit)? = null
    private val imageLauncher = activity.registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val done = pendingImage
        pendingImage = null
        if (uri == null || done == null) return@registerForActivityResult
        Thread {
            val bytes = runCatching { activity.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
            if (bytes != null) activity.runOnUiThread { done(bytes) }
        }.start()
    }
    private val backgroundFile get() = File(activity.filesDir, "background")

    override fun copy(text: String) {
        activity.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Virulenter", text))
    }

    override fun saveFile(name: String, mime: String, text: String) {
        pendingSave = text
        saveLauncher.launch(name)
    }

    override fun pickImage(onBytes: (ByteArray) -> Unit) {
        pendingImage = onBytes
        imageLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    override fun readBackground(): ByteArray? = backgroundFile.takeIf { it.isFile }?.readBytes()

    override fun writeBackground(bytes: ByteArray?) {
        if (bytes == null) backgroundFile.delete() else AtomicFileStorage(backgroundFile).writeBytes(bytes)
    }

    override fun openFile(onText: (String) -> Unit) {
        pendingOpen = onText
        openLauncher.launch(arrayOf("application/json", "text/plain", "application/octet-stream"))
    }

    private val allowedState = mutableStateOf(Notifier.allowed(activity))
    private val exactState: MutableState<Boolean>? = if (Build.VERSION.SDK_INT >= 31) mutableStateOf(Alarms.exactAllowed(activity)) else null

    override val notifications = object : Notifications {
        override val liveTitle = "Live notification"
        override val liveDetail = "Stays in the shade: today's count, a clock running since the last tap, +1 and Undo. The Quick Settings tile and the widget count the same event."
        override val allowed = allowedState
        override val exactAlarms = exactState

        /* Ask once with the system dialog; after a refusal (or when they were
           switched off in Settings) the app's notification settings open instead. */
        override fun requestPermission() {
            val needsGrant = Build.VERSION.SDK_INT >= 33 &&
                activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            if (needsGrant && !asked) {
                asked = true
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                activity.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName))
            }
        }

        override fun requestExactAlarms() {
            if (Build.VERSION.SDK_INT >= 31) {
                activity.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + activity.packageName)))
            }
        }

        override fun test(state: AppState) = Notifier.test(activity, state)
    }

    /** Re-reads permissions (after a dialog or a trip to Settings) and re-syncs. */
    fun refresh() {
        allowedState.value = Notifier.allowed(activity)
        exactState?.value = Alarms.exactAllowed(activity)
        Sync.all(activity, Graph.store.current)
    }
}
