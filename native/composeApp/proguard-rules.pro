# R8 rules for the release APK. The libraries bring their own (Compose,
# AndroidX, kotlinx.serialization, coroutines); these cover the app.

# The app's own classes are few: keep them whole, names included, so that
# nothing reached by name (serializers, the manifest's receivers, tile and
# widget, the generated resource accessors) can go missing.
-keep class com.virulenter.** { *; }

# Readable stack traces from a crash report.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
