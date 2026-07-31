package com.example.gravitydenimpos

import android.app.Presentation
import android.content.Context
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.Display
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

/**
 * CustomerPresentation — Proyección Nativa en Pantalla Secundaria iMin D4-504
 *
 * Esta clase toma el control exclusivo de la segunda pantalla física (DISPLAY_CATEGORY_PRESENTATION).
 * Carga ÚNICAMENTE la ruta `/pantalla-cliente` del POS.
 * Bloquea cualquier intento de navegación fuera de dicha ruta para proteger
 * la privacidad de la administración, inventario, reportes y ajustes.
 */
class CustomerPresentation(
    outerContext: Context,
    display: Display,
    private val customerUrl: String
) : Presentation(outerContext, display) {

    private var customerWebView: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val rootLayout = FrameLayout(context)
        rootLayout.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )

        customerWebView = WebView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )

            // Habilitar Galletas en la pantalla secundaria
            val cookieManager = CookieManager.getInstance()
            cookieManager.setAcceptCookie(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                cookieManager.setAcceptThirdPartyCookies(this, true)
            }

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                cacheMode = WebSettings.LOAD_DEFAULT
                
                // Configuración específica de escala e impresión visual para iMin D4-504
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                useWideViewPort = true
                loadWithOverviewMode = true
                textZoom = 100 // Escala de texto forzada al 100% para evitar agrandamientos del SO
                
                userAgentString = "$userAgentString iMinPOS/D4-504 (I20D01-CustomerDisplay)"
            }

            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val url = request?.url?.toString() ?: return false
                    // Garantía de Seguridad: SOLO permitir URLs que contengan /pantalla-cliente
                    if (!url.contains("/pantalla-cliente")) {
                        Log.w("CustomerPresentation", "Navegación denegada en pantalla secundaria: $url")
                        return true // Bloquear navegación fuera de la vista del cliente
                    }
                    return false
                }

                override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
                    Log.w("CustomerPresentation", "SSL Warning en Pantalla Secundaria: ${error?.toString()}")
                    handler?.proceed()
                }
            }

            addJavascriptInterface(WebAppInterface(context), "AndroidBridge")
            loadUrl(customerUrl)
        }

        rootLayout.addView(customerWebView)
        setContentView(rootLayout)
    }

    fun evaluateJavascript(script: String) {
        try {
            customerWebView?.evaluateJavascript(script, null)
        } catch (e: Exception) {
            Log.e("CustomerPresentation", "Error al evaluar JS en secundaria: ${e.message}")
        }
    }
}
