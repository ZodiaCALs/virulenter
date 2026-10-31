package com.virulenter.android

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import com.virulenter.R
import com.virulenter.model.AppState
import com.virulenter.model.Dates
import com.virulenter.model.Event
import com.virulenter.model.Palette
import com.virulenter.model.Stats
import kotlin.math.min

/*
 * Notifications, with the framework API only (minSdk 26 has channels).
 *
 *  - Live counter: an ongoing notification for the tracked event. Its time
 *    is a chronometer counting up from the last tap — a clock that runs in
 *    the shade without the app — with +1 and Undo buttons and, when the
 *    event has a goal, a progress bar.
 *  - Reminders: posted by AlarmManager at the time set on an event, with a
 *    +1 button that counts without opening the app.
 *  - Goals: once, on the tap that reaches the day's goal.
 */
/** Core system services are always present; the SDK just types them nullable. */
fun Context.notificationManager(): NotificationManager = getSystemService(NotificationManager::class.java)!!

object Notifier {
    const val CH_LIVE = "live"
    const val CH_REMIND = "reminders"
    const val CH_GOAL = "goals"
    private const val ID_LIVE = 7
    private const val ID_TEST = 9

    fun createChannels(c: Context) {
        val nm = c.notificationManager()
        nm.createNotificationChannels(
            listOf(
                NotificationChannel(CH_LIVE, c.getString(R.string.channel_live), NotificationManager.IMPORTANCE_LOW).apply {
                    description = c.getString(R.string.channel_live_detail)
                    setShowBadge(false)
                },
                NotificationChannel(CH_REMIND, c.getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_HIGH).apply {
                    description = c.getString(R.string.channel_reminders_detail)
                },
                NotificationChannel(CH_GOAL, c.getString(R.string.channel_goals), NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = c.getString(R.string.channel_goals_detail)
                },
            ),
        )
    }

    fun allowed(c: Context): Boolean {
        val nm = c.notificationManager()
        if (!nm.areNotificationsEnabled()) return false
        return Build.VERSION.SDK_INT < 33 || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }

    fun reminderId(eventId: String): Int = 1000 + (eventId.hashCode() and 0x7fff)

    fun openApp(c: Context): PendingIntent = PendingIntent.getActivity(
        c, 0,
        Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /** A broadcast to [TapReceiver]. The data URI makes each event, action and
     *  source its own PendingIntent, so one never overwrites another's extras. */
    fun broadcast(c: Context, action: String, eventId: String, from: Int = 0): PendingIntent = PendingIntent.getBroadcast(
        c, 0,
        Intent(c, TapReceiver::class.java)
            .setAction(action)
            .setData(Uri.parse("virulenter://event/${Uri.encode(eventId)}/$from"))
            .putExtra(TapReceiver.EXTRA_ID, eventId)
            .putExtra(TapReceiver.EXTRA_FROM, from),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun action(c: Context, icon: Int, label: String, intent: PendingIntent) =
        Notification.Action.Builder(Icon.createWithResource(c, icon), label, intent).build()

    private fun color(e: Event): Int = Palette.argb(e.color).toInt()

    fun live(c: Context, s: AppState) {
        val nm = c.notificationManager()
        val e = s.tracked
        if (!s.settings.liveTracker || e == null || !allowed(c)) {
            nm.cancel(ID_LIVE)
            return
        }
        val today = Stats.countOn(e, Dates.today())
        val last = e.last
        val b = Notification.Builder(c, CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_tap)
            .setContentTitle("${e.name} · $today today")
            .setContentText(if (last == null) "No taps yet — +1 to start" else "Last at ${Dates.fmtTime(last)} · ${e.count} in total")
            .setColor(color(e))
            .setCategory(Notification.CATEGORY_STOPWATCH)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(last != null)
            .setContentIntent(openApp(c))
            .addAction(action(c, R.drawable.ic_stat_plus, "+1", broadcast(c, TapReceiver.ACTION_TAP, e.id, TapReceiver.FROM_LIVE)))
        if (last != null) {
            /* the clock: counts up from the last tap, drawn by the system */
            b.setWhen(last).setUsesChronometer(true)
            if (Dates.now() - last < 15 * 60_000) b.addAction(action(c, R.drawable.ic_stat_undo, "Undo", broadcast(c, TapReceiver.ACTION_UNDO, e.id)))
        }
        e.goal?.let { goal ->
            b.setProgress(goal, min(today, goal), false)
            b.setSubText(if (today >= goal) "Goal met" else "$today of $goal")
        }
        nm.notify(ID_LIVE, b.build())
    }

    fun reminder(c: Context, e: Event) {
        if (!allowed(c)) return
        val today = Stats.countOn(e, Dates.today())
        val n = Notification.Builder(c, CH_REMIND)
            .setSmallIcon(R.drawable.ic_stat_tap)
            .setContentTitle("Time for ${e.name}?")
            .setContentText(if (today == 0) "Nothing logged today yet." else "$today logged today so far.")
            .setColor(color(e))
            .setCategory(Notification.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openApp(c))
            .addAction(action(c, R.drawable.ic_stat_plus, "+1 ${e.name}", broadcast(c, TapReceiver.ACTION_TAP, e.id, TapReceiver.FROM_REMINDER)))
            .build()
        c.notificationManager().notify(reminderId(e.id), n)
    }

    fun goal(c: Context, e: Event, today: Int) {
        if (!allowed(c)) return
        val n = Notification.Builder(c, CH_GOAL)
            .setSmallIcon(R.drawable.ic_stat_tap)
            .setContentTitle("Goal reached: ${e.name}")
            .setContentText("$today today — the goal was ${e.goal}.")
            .setColor(color(e))
            .setAutoCancel(true)
            .setContentIntent(openApp(c))
            .build()
        c.notificationManager().notify(2000 + (e.id.hashCode() and 0x7fff), n)
    }

    fun test(c: Context, s: AppState) {
        if (!allowed(c)) return
        val e = s.tracked
        val n = Notification.Builder(c, CH_REMIND)
            .setSmallIcon(R.drawable.ic_stat_tap)
            .setContentTitle("Virulenter")
            .setContentText(if (e == null) "Notifications work." else "${e.name}: ${Stats.countOn(e, Dates.today())} today")
            .setAutoCancel(true)
            .setContentIntent(openApp(c))
            .apply { if (e != null) addAction(action(c, R.drawable.ic_stat_plus, "+1", broadcast(c, TapReceiver.ACTION_TAP, e.id))) }
            .build()
        c.notificationManager().notify(ID_TEST, n)
    }

    fun cancelReminder(c: Context, eventId: String) {
        c.notificationManager().cancel(reminderId(eventId))
    }
}
