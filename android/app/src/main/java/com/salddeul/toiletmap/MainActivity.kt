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
import android.widget.LinearLayout
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.MobileAds
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 안양 과천 화장실맵 모바일 웹페이지를 바로 열어주는 앱.
 * 실제 기능(지도, 편집 코드, 화장실 등록)은 모두 웹페이지에 있다.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var adContainer: FrameLayout
    private var adView: AdView? = null
    private val adsStarted = AtomicBoolean(false)
    private val homeUrl: String = BuildConfig.WEB_URL
    private val homeHost: String? = Uri.parse(homeUrl).host

    private var backCallback: OnBackInvokedCallback? = null

    // 웹페이지가 위치 권한을 요청했을 때 안드로이드 권한 응답을 기다리는 동안 보관
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 위: 웹페이지(지도), 아래: 광고 배너
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        webView = WebView(this)
        root.addView(webView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        adContainer = FrameLayout(this)
        root.addView(
            adContainer,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        )
        setContentView(root)
        applySystemBarInsets(root)
        setupAds()

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

        // Android 13+ (targetSdk 36 부터 필수): 새 뒤로가기 방식. onBackPressed 는 더 이상 불리지 않음
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            backCallback = OnBackInvokedCallback { handleBack() }.also {
                onBackInvokedDispatcher.registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, it
                )
            }
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(homeUrl)
        }
    }

    /**
     * Google AdMob 하단 배너. 유럽 등 동의가 필요한 지역이면 먼저 동의 화면(UMP)을 띄운다.
     * 동의 확인이 실패해도 광고 요청이 허용되면 광고를 띄운다.
     */
    private fun setupAds() {
        val consent = UserMessagingPlatform.getConsentInformation(this)
        consent.requestConsentInfoUpdate(
            this,
            ConsentRequestParameters.Builder().build(),
            {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(this) {
                    if (consent.canRequestAds()) startAds()
                }
            },
            { if (consent.canRequestAds()) startAds() }
        )
        if (consent.canRequestAds()) startAds()
    }

    private fun startAds() {
        if (!adsStarted.compareAndSet(false, true)) return
        Thread { MobileAds.initialize(this) {} }.start()
        adContainer.post {
            val density = resources.displayMetrics.density
            val widthDp = (adContainer.width.takeIf { it > 0 } ?: resources.displayMetrics.widthPixels) / density
            val view = AdView(this).apply {
                adUnitId = if (BuildConfig.DEBUG) TEST_BANNER_ID else BuildConfig.ADMOB_BANNER_ID
                setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this@MainActivity, widthDp.toInt()))
            }
            adView = view
            adContainer.addView(view)
            view.loadAd(AdRequest.Builder().build())
        }
    }

    /** targetSdk 35+ 의 edge-to-edge 화면에서 상태바/내비게이션바에 웹페이지가 가려지지 않게 한다. */
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

    /** 웹페이지에 열린 창/메뉴가 있으면 먼저 닫고, 없으면 이전 페이지 또는 앱 종료 */
    private fun handleBack() {
        webView.evaluateJavascript("(window.toiletmapBack ? window.toiletmapBack() : false)") { result ->
            if (result != "true") {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        }
    }

    // Android 12 이하
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        handleBack()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        adView?.resume()
        webView.onResume()
    }

    override fun onPause() {
        // 편집 코드 로그인 쿠키를 디스크에 저장
        CookieManager.getInstance().flush()
        adView?.pause()
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            backCallback?.let { onBackInvokedDispatcher.unregisterOnBackInvokedCallback(it) }
        }
        adView?.destroy()
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val REQ_LOCATION = 1001
        // 개발용(디버그 빌드) 테스트 광고 ID — 실제 앱(release)은 BuildConfig.ADMOB_BANNER_ID 사용
        private const val TEST_BANNER_ID = "ca-app-pub-3940256099942544/9214589741"
    }
}
