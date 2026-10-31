package com.virulenter.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/* The web app's line icons (app/index.html), same paths, so both apps speak
   one visual language; a few native-only ones follow. 24-unit grid, drawn as
   1.8-unit round strokes and tinted by Icon(). */
object VIcons {
    private fun icon(name: String, path: String): ImageVector =
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f)
            .addPath(
                pathData = addPathNodes(path),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.8f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
            .build()

    val Plus: ImageVector by lazy { icon("Plus", "M12 5v14M5 12h14") }
    val Close: ImageVector by lazy { icon("Close", "M6.5 6.5l11 11M17.5 6.5l-11 11") }
    val Check: ImageVector by lazy { icon("Check", "m5 12.5 4.5 4.5L19 7.5") }
    val Left: ImageVector by lazy { icon("Left", "m14.5 6-6 6 6 6") }
    val Right: ImageVector by lazy { icon("Right", "m9.5 6 6 6-6 6") }
    val Down: ImageVector by lazy { icon("Down", "m6.5 9.5 5.5 5.5 5.5-5.5") }
    val Up: ImageVector by lazy { icon("Up", "m6.5 14.5 5.5-5.5 5.5 5.5") }
    val Search: ImageVector by lazy { icon("Search", "M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0 -13 0Zm20 20-4.2-4.2") }
    val Sort: ImageVector by lazy { icon("Sort", "M8 5v14M4.5 15.5 8 19l3.5-3.5M16 19V5M12.5 8.5 16 5l3.5 3.5") }
    val More: ImageVector by lazy { icon("More", "M4.1 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0ZM10.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0ZM17.1 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0Z") }
    val Home: ImageVector by lazy { icon("Home", "M4 10.5 12 4l8 6.5V19a2 2 0 0 1-2 2h-3.5v-6h-5v6H6a2 2 0 0 1-2-2Z") }
    val Calendar: ImageVector by lazy { icon("Calendar", "M7 5H17a3.5 3.5 0 0 1 3.5 3.5V17a3.5 3.5 0 0 1 -3.5 3.5H7a3.5 3.5 0 0 1 -3.5 -3.5V8.5a3.5 3.5 0 0 1 3.5 -3.5ZM8 3v4M16 3v4M3.5 10.5h17") }
    val Chart: ImageVector by lazy { icon("Chart", "M5 20v-7M10 20V5M15 20v-9M20 20v-4") }
    val Sliders: ImageVector by lazy { icon("Sliders", "M4 7h8.5M16.5 7H20M4 17h3.5M11.5 17H20M12.5 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0ZM7.5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z") }
    val Download: ImageVector by lazy { icon("Download", "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14") }
    val Upload: ImageVector by lazy { icon("Upload", "M12 15V4M7.5 8.5 12 4l4.5 4.5M5 20h14") }
    val Share: ImageVector by lazy { icon("Share", "M12 14.5V4M8 7.5l4-4 4 4M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1") }
    val Copy: ImageVector by lazy { icon("Copy", "M11 8.5H17.5a2.5 2.5 0 0 1 2.5 2.5V17.5a2.5 2.5 0 0 1 -2.5 2.5H11a2.5 2.5 0 0 1 -2.5 -2.5V11a2.5 2.5 0 0 1 2.5 -2.5ZM15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5") }
    val External: ImageVector by lazy { icon("External", "M13.5 4.5H19.5V10.5M19.5 4.5 11 13M17 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4") }
    val Table: ImageVector by lazy { icon("Table", "M7 4H17a3 3 0 0 1 3 3V17a3 3 0 0 1 -3 3H7a3 3 0 0 1 -3 -3V7a3 3 0 0 1 3 -3ZM4 9.5h16M4 14.5h16M9.5 4v16") }
    val Save: ImageVector by lazy { icon("Save", "M6 4h9.5L20 8.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM8 4v4.5h7V4M7.5 20v-6h9v6") }
    val Trash: ImageVector by lazy { icon("Trash", "M4.5 7h15M10 11v5.5M14 11v5.5M6.5 7l.9 11.2A2 2 0 0 0 9.4 20h5.2a2 2 0 0 0 2-1.8L17.5 7M9.5 7V4.5h5V7") }
    val Palette: ImageVector by lazy { icon("Palette", "M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-1 1.3-2l-.4-.8c-.6-1.2.3-2.6 1.6-2.6h1.8a4.2 4.2 0 0 0 4.2-4.2C20.5 6.6 16.7 3.5 12 3.5ZM6.5 11.2a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0ZM8.9 7.4a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0ZM13.5 7.6a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0Z") }
    val Shield: ImageVector by lazy { icon("Shield", "M12 3.5 5 6.2v5.3c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6.2Zm9 12 2.2 2.2L15.5 10") }
    val Sun: ImageVector by lazy { icon("Sun", "M8.2 12a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0 -7.6 0ZM12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4") }
    val Moon: ImageVector by lazy { icon("Moon", "M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1Z") }
    val Monitor: ImageVector by lazy { icon("Monitor", "M6 4.5H18a2.5 2.5 0 0 1 2.5 2.5V13.5a2.5 2.5 0 0 1 -2.5 2.5H6a2.5 2.5 0 0 1 -2.5 -2.5V7a2.5 2.5 0 0 1 2.5 -2.5ZM9 20h6M12 16v4") }
    val Alert: ImageVector by lazy { icon("Alert", "M10.3 4.6 3.1 17.2A2 2 0 0 0 4.8 20h14.4a2 2 0 0 0 1.7-2.8L13.7 4.6a2 2 0 0 0-3.4 0ZM12 9.5v4M12 16.8v.2") }
    val Merge: ImageVector by lazy { icon("Merge", "M6 4v4a6 6 0 0 0 6 6h0a6 6 0 0 1 6 6M18 4v4a6 6 0 0 1-3 5.2M15 17.5 18 20.5 21 17.5") }
    val Clock: ImageVector by lazy { icon("Clock", "M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0ZM12 7.5V12l3 2") }
    val Bell: ImageVector by lazy { icon("Bell", "M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14ZM10 20.5a2 2 0 0 0 4 0") }
    val Stopwatch: ImageVector by lazy { icon("Stopwatch", "M5 13.5a7 7 0 1 0 14 0a7 7 0 1 0 -14 0ZM12 13.5V10M10 3h4M18.2 6.8l1.3-1.3") }
    val Pencil: ImageVector by lazy { icon("Pencil", "M4.5 19.5h4L19 9a2.8 2.8 0 0 0-4-4L4.5 15.5ZM13.5 6.5l4 4") }
    val Target: ImageVector by lazy { icon("Target", "M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0ZM7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0ZM11.4 12a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0Z") }
    val Undo: ImageVector by lazy { icon("Undo", "M9 14 4.5 9.5 9 5M4.5 9.5H15a5 5 0 0 1 0 10h-3") }
    val Link: ImageVector by lazy { icon("Link", "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1") }
    val Info: ImageVector by lazy { icon("Info", "M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0ZM12 11v5M12 8v.2") }
    val Pin: ImageVector by lazy { icon("Pin", "M9 4h6l-1 5 3 3v1.5H7V12l3-3ZM12 13.5V20") }
    val Window: ImageVector by lazy { icon("Window", "M6 5H18a2.5 2.5 0 0 1 2.5 2.5V16.5a2.5 2.5 0 0 1 -2.5 2.5H6a2.5 2.5 0 0 1 -2.5 -2.5V7.5a2.5 2.5 0 0 1 2.5 -2.5ZM3.5 9h17") }
    val Today: ImageVector by lazy { icon("Today", "M7 5H17a3.5 3.5 0 0 1 3.5 3.5V17a3.5 3.5 0 0 1 -3.5 3.5H7a3.5 3.5 0 0 1 -3.5 -3.5V8.5a3.5 3.5 0 0 1 3.5 -3.5ZM8 3v4M16 3v4M3.5 10.5h17M10.4 15.5a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0Z") }
}
