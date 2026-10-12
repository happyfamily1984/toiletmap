package com.salddeul.toiletmap

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

/**
 * 안양 과천 화장실맵 모바일 웹페이지를 바로 열어주는 앱.
 * 실제 기능(지도, 접속 코드, 화장실 등록)은 모두 웹페이지에 있다.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private val homeUrl: String = BuildConfig.WEB_URL
    private val homeHost: String? = Uri.parse(homeUrl).host

    // 웹페이지가 위치 권한을 요청했을 때 안드로이드 권한 응답을 기다리는 동안 보관
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this)
        webView = WebView(this)
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(root)
        applySystemBarInsets(root)

        CookieManager.getInstance().setAcceptCookie(true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setGeolocationEnabled(true)
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                val isWeb = uri.scheme == "http" || uri.scheme == "https"
                // 우리 사이트와 네이버 지도 리소스는 앱 안에서, 나머지는 외부 앱으로
                if (isWeb && (uri.host == homeHost || uri.host?.endsWith("naver.com") == true)) {
                    return false
                }
                openExternal(uri)
                return true
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (request.isForMainFrame) showOfflinePage()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false)
                } else {
                    pendingGeoOrigin = origin
                    pendingGeoCallback = callback
                    requestPermissions(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        ),
                        REQ_LOCATION
                    )
                }
            }
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(homeUrl)
        }
    }

    /** targetSdk 35 의 edge-to-edge 화면에서 상태바/내비게이션바에 웹페이지가 가려지지 않게 한다. */
    private fun applySystemBarInsets(root: View) {
        root.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom
                )
            }
            insets
        }
    }

    private fun hasLocationPermission(): Boolean =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_LOCATION) {
            val granted = grantResults.any { it == PackageManager.PERMISSION_GRANTED }
            pendingGeoCallback?.invoke(pendingGeoOrigin, granted, false)
            pendingGeoCallback = null
            pendingGeoOrigin = null
        }
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            // 열 수 있는 앱이 없으면 무시
        }
    }

    private fun showOfflinePage() {
        val html = """
            <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>
              body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
                   height:100vh;margin:0;text-align:center;color:#1d2420}
              a{display:inline-block;margin-top:16px;padding:12px 24px;border-radius:12px;
                background:#1f9d6b;color:#fff;text-decoration:none;font-weight:bold}
            </style></head>
            <body><div><h2>안양 과천 화장실맵</h2><p>서버에 연결할 수 없습니다.<br>인터넷 연결을 확인해 주세요.</p>
            <a href="$homeUrl">다시 시도</a></div></body></html>
        """.trimIndent()
        webView.loadDataWithBaseURL(homeUrl, html, "text/html", "utf-8", null)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // 웹페이지에 열린 시트/메뉴가 있으면 먼저 닫고, 없으면 뒤로가기 또는 앱 종료
        webView.evaluateJavascript("(window.toiletmapBack ? window.toiletmapBack() : false)") { result ->
            if (result != "true") {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    @Suppress("DEPRECATION")
                    super.onBackPressed()
                }
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        // 접속 코드 로그인 쿠키를 디스크에 저장
        CookieManager.getInstance().flush()
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val REQ_LOCATION = 1001
    }
}
