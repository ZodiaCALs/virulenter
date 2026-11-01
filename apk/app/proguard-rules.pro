# The page calls the bridge by method name (addJavascriptInterface).
# proguard-android-optimize.txt already keeps @JavascriptInterface methods;
# this names the one class that has them, so the rule survives a change of
# defaults.
-keepclassmembers class com.virulenter.app.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
