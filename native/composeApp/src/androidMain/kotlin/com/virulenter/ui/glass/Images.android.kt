package com.virulenter.ui.glass

import android.content.res.Resources
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import java.io.ByteArrayInputStream
import kotlin.math.max
import kotlin.math.roundToInt

/*
 * Sized to the screen (fitScale): the decoder skips straight to the nearest
 * power of two above the target, so a 12-megapixel photo is never held at
 * full size, then one filtered scale lands on the target and the EXIF
 * orientation turns it upright. The result is handed to the GPU as a
 * hardware bitmap, so the picture lives in graphics memory once instead of
 * once there and once more in the app's heap.
 */
actual fun decodeImage(bytes: ByteArray, maxSide: Int): ImageBitmap? = runCatching {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    val degrees = when (ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
        else -> 0f
    }
    /* the size it is shown at, measured upright */
    val turned = degrees == 90f || degrees == 270f
    val w = if (turned) bounds.outHeight else bounds.outWidth
    val h = if (turned) bounds.outWidth else bounds.outHeight
    val screen = Resources.getSystem().displayMetrics
    val k = fitScale(w, h, max(screen.widthPixels, screen.heightPixels), minOf(screen.widthPixels, screen.heightPixels), maxSide)
    val targetW = (w * k).roundToInt().coerceAtLeast(1)
    val targetH = (h * k).roundToInt().coerceAtLeast(1)

    var sample = 1
    while (w / (sample * 2) >= targetW && h / (sample * 2) >= targetH) sample *= 2
    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: return null
    /* one pass: rotate and scale to the target together */
    val upright = if (turned) decoded.height else decoded.width
    val scale = targetW.toFloat() / upright
    val sized = if (degrees == 0f && scale >= 0.999f) decoded else {
        val m = Matrix().apply { postRotate(degrees); postScale(scale, scale) }
        Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, m, true).also { if (it !== decoded) decoded.recycle() }
    }
    val gpu = runCatching { sized.copy(Bitmap.Config.HARDWARE, false) }.getOrNull()
    if (gpu != null) { sized.recycle(); gpu.asImageBitmap() } else sized.asImageBitmap()
}.getOrNull()
