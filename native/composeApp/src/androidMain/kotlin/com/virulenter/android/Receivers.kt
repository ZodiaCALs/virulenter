package com.virulenter.android

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import com.virulenter.model.AppState
import com.virulenter.model.Dates
import com.virulenter.model.Schedule
import kotlinx.datetime.TimeZone
import kotlinx.datetime.isoDayNumber

/* +1 and Undo from a notification, the widget or a reminder — counted
   without opening the app. */
class TapReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val store = Graph.init(context)
        val id = intent.getStringExtra(EXTRA_ID) ?: store.current.tracked?.id ?: return
        when (intent.action) {
            ACTION_TAP -> store.tap(id)
            ACTION_UNDO -> store.current.event(id)?.last?.let { store.removeTap(id, it) }
        }
        if (intent.getIntExtra(EXTRA_FROM, 0) == FROM_REMINDER) Notifier.cancelReminder(context, id)
    }

    companion object {
        const val ACTION_TAP = "com.virulenter.action.TAP"
        const val ACTION_UNDO = "com.virulenter.action.UNDO"
        const val EXTRA_ID = "event"
        const val EXTRA_FROM = "from"
        const val FROM_LIVE = 1
        const val FROM_REMINDER = 2
        const val FROM_WIDGET = 3
    }
}

/*
 * Reminders through AlarmManager: one alarm per event, always the next
 * occurrence (computed by the shared Schedule, so desktop and Android agree).
 * Exact when the user allows exact alarms (Android 12+ asks), otherwise in
 * a ten-minute window — still reliable in Doze.
 */
fun Context.alarmManager(): AlarmManager = getSystemService(AlarmManager::class.java)!!

object Alarms {
    private const val PREFS = "alarms"
    private const val KEY = "scheduled"

    fun exactAllowed(c: Context): Boolean =
        Build.VERSION.SDK_INT < 31 || c.alarmManager().canScheduleExactAlarms()

    private fun pending(c: Context, id: String): PendingIntent = PendingIntent.getBroadcast(
        c, 0,
        Intent(c, ReminderReceiver::class.java)
            .setAction(ReminderReceiver.ACTION)
            .setData(Uri.parse("virulenter://reminder/${Uri.encode(id)}"))
            .putExtra(TapReceiver.EXTRA_ID, id),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    fun schedule(c: Context, s: AppState) {
        val am = c.alarmManager()
        val prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val before = prefs.getStringSet(KEY, emptySet()).orEmpty()
        val now = System.currentTimeMillis()
        val next = s.events.mapNotNull { e -> e.reminder?.let { r -> Schedule.next(r, now)?.let { e.id to it } } }
        val ids = next.map { it.first }.toSet()

        for (gone in before - ids) am.cancel(pending(c, gone))
        val exact = exactAllowed(c)
        for ((id, at) in next) {
            val pi = pending(c, id)
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setWindow(AlarmManager.RTC_WAKEUP, at, 10 * 60_000L, pi)
        }
        prefs.edit().putStringSet(KEY, ids).apply()
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val store = Graph.init(context)
        val e = store.current.event(intent.getStringExtra(TapReceiver.EXTRA_ID))
        val r = e?.reminder
        if (e != null && r != null && r.enabled && r.onDay(Dates.today().dayOfWeek.isoDayNumber)) Notifier.reminder(context, e)
        /* and the one after */
        Alarms.schedule(context, store.current)
    }

    companion object {
        const val ACTION = "com.virulenter.action.REMIND"
    }
}

/* After a reboot or an update alarms are gone; after a time-zone change the
   day boundaries move. Put everything back. */
class SystemReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Dates.zone = TimeZone.currentSystemDefault()
        val store = Graph.init(context)
        Sync.all(context, store.current)
    }
}
