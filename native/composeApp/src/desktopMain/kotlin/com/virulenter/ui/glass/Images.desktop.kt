package com.virulenter.ui.glass

import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import org.jetbrains.skia.Image
import org.jetbrains.skia.Rect
import org.jetbrains.skia.Surface
import kotlin.math.max
import kotlin.math.roundToInt

actual fun decodeImage(bytes: ByteArray, maxSide: Int): ImageBitmap? = runCatching {
    val image = Image.makeFromEncoded(bytes)
    val k = maxSide.toFloat() / max(image.width, image.height)
    if (k >= 1f) {
        image.toComposeImageBitmap()
    } else {
        val w = (image.width * k).roundToInt().coerceAtLeast(1)
        val h = (image.height * k).roundToInt().coerceAtLeast(1)
        val surface = Surface.makeRasterN32Premul(w, h)
        surface.canvas.drawImageRect(image, Rect.makeWH(w.toFloat(), h.toFloat()))
        surface.makeImageSnapshot().toComposeImageBitmap()
    }
}.getOrNull()
