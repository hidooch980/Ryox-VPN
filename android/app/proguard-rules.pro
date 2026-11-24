# JavaScript invokes these native WebView methods by name.
-keepclassmembers class com.ryox.vpn.bridge.AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
