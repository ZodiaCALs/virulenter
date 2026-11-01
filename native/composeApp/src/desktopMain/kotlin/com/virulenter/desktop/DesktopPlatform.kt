package com.virulenter.desktop

import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.window.Notification
import androidx.compose.ui.window.TrayState
import com.virulenter.APP_VERSION
import com.virulenter.model.AppState
import com.virulenter.model.Dates
import com.virulenter.model.Stats
import com.virulenter.model.Storage
import com.virulenter.platform.Notifications
import com.virulenter.platform.Platform
import java.awt.FileDialog
import java.awt.Frame
import java.awt.Toolkit
import java.awt.datatransfer.StringSelection
import java.io.File
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** One JSON file in the platform's per-user data folder, written atomically. */
class FileStorage(private val file: File) : Storage {
    override fun read(): String? = if (file.isFile) file.readText() else null

    override fun write(text: String) {
        file.parentFile?.mkdirs()
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(text)
        try {
            Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }

    companion object {
        val os: String = System.getProperty("os.name").orEmpty().lowercase()
        val isMac = os.contains("mac")
        val isWindows = os.contains("win")

        /** %APPDATA%\Virulenter, ~/Library/Application Support/Virulenter, or $XDG_DATA_HOME/virulenter. */
        fun defaultFile(): File {
            val home = System.getProperty("user.home")
            return when {
                isWindows -> File(System.getenv("APPDATA") ?: "$home/AppData/Roaming", "Virulenter/virulenter.json")
                isMac -> File(home, "Library/Application Support/Virulenter/virulenter.json")
                else -> File(System.getenv("XDG_DATA_HOME")?.takeIf { it.isNotBlank() } ?: "$home/.local/share", "virulenter/virulenter.json")
            }
        }
    }
}

/*
 * Notifications through the system tray (Windows toasts, macOS Notification
 * Center, the desktop's notification daemon on Linux). Where there is no
 * tray, Linux and macOS still get one through notify-send / osascript.
 */
class DesktopNotifier(private val tray: TrayState?) : Notifications {
    override val liveTitle = "Mini counter"
    override val liveDetail = "A small always-on-top window: today's count, the time since the last tap, and a +1 button."
    override val allowed: State<Boolean> = mutableStateOf(true)
    override fun requestPermission() {}
    override val exactAlarms: State<Boolean>? = null
    override fun requestExactAlarms() {}

    override fun test(state: AppState) {
        val e = state.tracked
        send("Virulenter", if (e == null) "Notifications work." else "${e.name}: ${Stats.countOn(e, Dates.today())} today")
    }

    fun send(title: String, text: String) {
        if (tray != null) {
            tray.sendNotification(Notification(title, text, Notification.Type.Info))
            return
        }
        val cmd = when {
            FileStorage.isMac -> listOf("osascript", "-e", "display notification \"${text.replace("\"", "'")}\" with title \"${title.replace("\"", "'")}\"")
            !FileStorage.isWindows -> listOf("notify-send", "-a", "Virulenter", title, text)
            else -> return
        }
        runCatching { ProcessBuilder(cmd).redirectErrorStream(true).start() }
    }
}

private val IMAGE = Regex("\\.(jpe?g|png|webp|gif|bmp)$", RegexOption.IGNORE_CASE)

class DesktopPlatform(override val notifications: DesktopNotifier) : Platform {
    override val kind = Platform.Kind.Desktop
    override val version = APP_VERSION

    override fun copy(text: String) {
        Toolkit.getDefaultToolkit().systemClipboard.setContents(StringSelection(text), null)
    }

    override fun saveFile(name: String, mime: String, text: String) {
        val dialog = FileDialog(null as Frame?, "Export backup", FileDialog.SAVE).apply { file = name }
        dialog.isVisible = true
        val chosen = dialog.file ?: return
        File(dialog.directory, chosen).writeText(text)
    }

    override fun pickImage(onBytes: (ByteArray) -> Unit) {
        val dialog = FileDialog(null as Frame?, "Choose a background", FileDialog.LOAD).apply {
            setFilenameFilter { _, n -> IMAGE.containsMatchIn(n) }
        }
        dialog.isVisible = true
        val chosen = dialog.file ?: return
        runCatching { File(dialog.directory, chosen).readBytes() }.onSuccess(onBytes)
    }

    /* next to the data file, in the same per-user folder */
    private val backgroundFile = File(FileStorage.defaultFile().parentFile, "background")

    override fun readBackground(): ByteArray? = if (backgroundFile.isFile) backgroundFile.readBytes() else null

    override fun writeBackground(bytes: ByteArray?) {
        if (bytes == null) { backgroundFile.delete(); return }
        backgroundFile.parentFile?.mkdirs()
        backgroundFile.writeBytes(bytes)
    }

    override fun openFile(onText: (String) -> Unit) {
        val dialog = FileDialog(null as Frame?, "Import", FileDialog.LOAD).apply {
            setFilenameFilter { _, n -> n.endsWith(".json", true) || n.endsWith(".txt", true) }
        }
        dialog.isVisible = true
        val chosen = dialog.file ?: return
        runCatching { File(dialog.directory, chosen).readText() }.onSuccess(onText)
    }
}
