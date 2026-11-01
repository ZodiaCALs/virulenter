package com.virulenter.android

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.service.quicksettings.TileService
import android.util.AtomicFile
import com.virulenter.model.AppState
import com.virulenter.model.Dates
import com.virulenter.model.Stats
import com.virulenter.model.Storage
import com.virulenter.model.Store
import com.virulenter.ui.AppController
import java.io.File
import java.io.IOException

class VirulenterApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Graph.init(this)
    }
}

/** The state file, replaced atomically so a crash mid-write cannot corrupt it. */
class AtomicFileStorage(file: File) : Storage {
    private val atomic = AtomicFile(file)

    override fun read(): String? = if (atomic.baseFile.exists()) atomic.readFully().decodeToString() else null

    override fun write(text: String) = writeBytes(text.encodeToByteArray())

    fun writeBytes(bytes: ByteArray) {
        val out = atomic.startWrite()
        try {
            out.write(bytes)
            atomic.finishWrite(out)
        } catch (e: IOException) {
            atomic.failWrite(out)
            throw e
        }
    }
}

/*
 * One store per process, shared by the activity, the notification buttons,
 * the Quick Settings tile, the widget and the alarm receivers — whichever
 * of them starts the process first creates it.
 */
object Graph {
    @Volatile
    private var instance: Store? = null

    val store: Store get() = instance ?: error("Graph.init has not run")
    val controller: AppController by lazy { AppController(store) }

    fun init(context: Context): Store {
        instance?.let { return it }
        synchronized(this) {
            instance?.let { return it }
            val app = context.applicationContext
            val s = Store(AtomicFileStorage(File(app.filesDir, "virulenter.json")))
            s.load()
            Notifier.createChannels(app)
            s.observe { state -> Sync.all(app, state) }
            instance = s
            Sync.all(app, s.current)
            return s
        }
    }
}

/* Brings every surface outside the app in line with the state. */
object Sync {
    private var previous: AppState? = null

    fun all(context: Context, state: AppState) {
        runCatching { Notifier.live(context, state) }
        runCatching { Alarms.schedule(context, state) }
        runCatching { CounterWidget.update(context, state) }
        runCatching { Shortcuts.update(context, state) }
        runCatching { TileService.requestListeningState(context, ComponentName(context, TapTileService::class.java)) }
        runCatching { goals(context, previous, state) }
        previous = state
    }

    /** A goal is announced once, on the tap that reaches it. */
    private fun goals(context: Context, before: AppState?, after: AppState) {
        if (before == null) return
        val today = Dates.today()
        for (e in after.events) {
            val goal = e.goal ?: continue
            val old = before.event(e.id) ?: continue
            if (e.count <= old.count) continue
            val was = Stats.countOn(old, today)
            val now = Stats.countOn(e, today)
            if (was < goal && now >= goal) Notifier.goal(context, e, now)
        }
    }
}
