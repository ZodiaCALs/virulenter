package com.virulenter.android

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.os.Build
import android.os.SystemClock
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.view.View
import android.widget.RemoteViews
import com.virulenter.R
import com.virulenter.model.AppState
import com.virulenter.model.Dates
import com.virulenter.model.Palette
import com.virulenter.model.Stats

/* Quick Settings: one tap in the shade counts the tracked event. */
class TapTileService : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        refresh()
    }

    override fun onClick() {
        super.onClick()
        val store = Graph.init(this)
        val e = store.current.tracked
        if (e == null) {
            val intent = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (Build.VERSION.SDK_INT >= 34) {
                startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE))
            } else {
                @Suppress("DEPRECATION")
                startActivityAndCollapse(intent)
            }
            return
        }
        store.tap(e.id)
        refresh()
    }

    private fun refresh() {
        val tile = qsTile ?: return
        val e = Graph.init(this).current.tracked
        tile.label = e?.name ?: getString(R.string.tile_label)
        if (Build.VERSION.SDK_INT >= 29) tile.subtitle = e?.let { "${Stats.countOn(it, Dates.today())} today · +1" } ?: "Add an event first"
        tile.state = if (e != null) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.icon = Icon.createWithResource(this, R.drawable.ic_stat_tap)
        tile.updateTile()
    }
}

/* Home-screen widget: today's count, a live clock since the last tap (a
   Chronometer the launcher runs), and +1. */
class CounterWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        update(context, Graph.init(context).current)
    }

    companion object {
        fun update(c: Context, s: AppState) {
            val manager = AppWidgetManager.getInstance(c) ?: return
            val ids = manager.getAppWidgetIds(ComponentName(c, CounterWidget::class.java))
            if (ids.isEmpty()) return
            val v = RemoteViews(c.packageName, R.layout.widget_counter)
            val e = s.tracked
            v.setOnClickPendingIntent(R.id.widget_root, Notifier.openApp(c))
            if (e == null) {
                v.setTextViewText(R.id.widget_name, c.getString(R.string.app_name))
                v.setTextViewText(R.id.widget_count, "–")
                v.setTextViewText(R.id.widget_meta, "add an event")
                v.setViewVisibility(R.id.widget_since, View.GONE)
                v.setOnClickPendingIntent(R.id.widget_plus, Notifier.openApp(c))
            } else {
                v.setTextViewText(R.id.widget_name, e.name)
                v.setTextViewText(R.id.widget_count, Stats.countOn(e, Dates.today()).toString())
                v.setTextViewText(R.id.widget_meta, "today · ${e.count} total")
                v.setInt(R.id.widget_accent, "setBackgroundColor", Palette.argb(e.color).toInt())
                val last = e.last
                if (last != null) {
                    v.setViewVisibility(R.id.widget_since, View.VISIBLE)
                    v.setChronometer(R.id.widget_since, SystemClock.elapsedRealtime() - (System.currentTimeMillis() - last), "%s since the last", true)
                } else {
                    v.setViewVisibility(R.id.widget_since, View.GONE)
                }
                v.setOnClickPendingIntent(R.id.widget_plus, Notifier.broadcast(c, TapReceiver.ACTION_TAP, e.id, TapReceiver.FROM_WIDGET))
            }
            manager.updateAppWidget(ids, v)
        }
    }
}

/* Long-press the app icon: "+1 Coffee" for the four most recent events. */
object Shortcuts {
    private var signature: String? = null

    fun update(c: Context, s: AppState) {
        val top = s.events.sortedByDescending { it.last ?: 0L }.take(4)
        val sig = top.joinToString("|") { it.id + "\u0000" + it.name }
        if (sig == signature) return    // the system rate-limits needless updates
        signature = sig
        val sm = c.getSystemService(ShortcutManager::class.java) ?: return
        val list = top.mapIndexed { rank, e ->
            ShortcutInfo.Builder(c, "tap-${e.id}")
                .setShortLabel("+1 ${e.name}".take(25))
                .setLongLabel("Count one ${e.name}".take(40))
                .setIcon(Icon.createWithResource(c, R.drawable.ic_shortcut_plus))
                .setRank(rank)
                .setIntent(Intent(c, MainActivity::class.java).setAction(MainActivity.ACTION_TAP).putExtra(TapReceiver.EXTRA_ID, e.id))
                .build()
        }
        runCatching { sm.dynamicShortcuts = list }
    }
}
