package com.example.gravitydenimpos

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import android.hardware.display.DisplayManager
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.Display
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ConsoleMessage
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

class MainActivity : Activity(), DisplayManager.DisplayListener {

    private var primaryWebView: WebView? = null
    private var customerPresentation: CustomerPresentation? = null
    private var displayManager: DisplayManager? = null

    private var rootLayout: FrameLayout? = null
    private var errorOverlay: LinearLayout? = null
    private var errorTextView: TextView? = null
    private var progressBar: ProgressBar? = null

    private var isInitialPageLoaded = false

    // URL exacta de producción del POS
    private val TARGET_POS_URL = "https://pos-gravitydenim.vercel.app/"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Inicialización de DisplayManager
        try {
            displayManager = getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
            displayManager?.registerDisplayListener(this, null)
        } catch (e: Exception) {
            Log.e("MainActivity", "Error al registrar DisplayManager: ${e.message}")
        }

        rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        // WebView Principal (Ocupa 100% de la pantalla)
        primaryWebView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )

            // Habilitar Desplazamiento Táctil Nativo
            isVerticalScrollBarEnabled = true
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
            isFocusable = true
            isFocusableInTouchMode = true
            requestFocus()
            setOnTouchListener(null)

            // Habilitar Cookies & Almacenamiento DOM
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
                useWideViewPort = true
                loadWithOverviewMode = true
                javaScriptCanOpenWindowsAutomatically = true
                mediaPlaybackRequiresUserGesture = false
                
                // UserAgent iMin D4-504
                userAgentString = "$userAgentString iMinPOS/D4-504 (I20D01)"
            }

            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                    Log.d("WebConsole", "[${consoleMessage?.messageLevel()}] ${consoleMessage?.message()} -- (${consoleMessage?.sourceId()}:${consoleMessage?.lineNumber()})")
                    return true
                }
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    return false
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                    if (!isInitialPageLoaded) {
                        progressBar?.visibility = View.VISIBLE
                    }
                    hideErrorUi()
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    isInitialPageLoaded = true
                    
                    // Remover permanentemente la barra de progreso tras cargar por primera vez
                    progressBar?.visibility = View.GONE
                    
                    // Conexión asíncrona no bloqueante con pantalla secundaria tras 500ms
                    view?.postDelayed({
                        updateCustomerPresentationSafely()
                    }, 500)
                }

                override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                    val isMainFrame = request?.isForMainFrame == true
                    if (isMainFrame && !isInitialPageLoaded) {
                        progressBar?.visibility = View.GONE
                        val errorDesc = error?.description ?: "Error de red"
                        val errorCode = error?.errorCode ?: 0
                        Log.e("MainActivity", "Error en WebView Principal ($errorCode): $errorDesc")
                        showErrorUi("No se pudo conectar al sistema POS ($errorCode)\n\n$errorDesc")
                    }
                }

                override fun onReceivedHttpError(view: WebView?, request: WebResourceRequest?, errorResponse: WebResourceResponse?) {
                    if (request?.isForMainFrame == true) {
                        val statusCode = errorResponse?.statusCode ?: 0
                        if (statusCode >= 400 && !isInitialPageLoaded) {
                            Log.e("MainActivity", "Error HTTP en WebView: $statusCode")
                        }
                    }
                }

                override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
                    Log.w("MainActivity", "SSL Warning en WebView: ${error?.toString()}")
                    handler?.proceed()
                }
            }

            addJavascriptInterface(WebAppInterface(this@MainActivity) { payloadJson ->
                try {
                    customerPresentation?.evaluateJavascript("if(window.onCustomerScreenUpdate) window.onCustomerScreenUpdate($payloadJson);")
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error enviando evento a pantalla secundaria: ${e.message}")
                }
            }, "AndroidBridge")
        }

        rootLayout?.addView(primaryWebView)

        // Spinner de Carga Inicial
        progressBar = ProgressBar(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.CENTER
            }
        }
        rootLayout?.addView(progressBar)

        // Layout de Error (Oculto por defecto)
        errorOverlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            setBackgroundColor(0xFF0F172A.toInt())
            visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        errorTextView = TextView(this).apply {
            setTextColor(0xFFF8FAFC.toInt())
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 32)
        }

        val retryBtn = Button(this).apply {
            text = "🔄 Reintentar Conexión"
            textSize = 14f
            setPadding(32, 16, 32, 16)
            setBackgroundColor(0xFF3B82F6.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setOnClickListener {
                hideErrorUi()
                isInitialPageLoaded = false
                progressBar?.visibility = View.VISIBLE
                primaryWebView?.loadUrl(TARGET_POS_URL)
            }
        }

        errorOverlay?.addView(errorTextView)
        errorOverlay?.addView(retryBtn)
        rootLayout?.addView(errorOverlay)

        setContentView(rootLayout)

        // Restaurar estado del WebView si existe, o cargar la URL por primera vez
        if (savedInstanceState != null) {
            primaryWebView?.restoreState(savedInstanceState)
        } else {
            primaryWebView?.loadUrl(TARGET_POS_URL)
        }

        // Vincular pantalla secundaria de cliente en segundo plano
        updateCustomerPresentationSafely()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        primaryWebView?.saveState(outState)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // Manejo in-situ del teclado y cambios de tamaño sin recargar el WebView ni el Activity
        Log.d("MainActivity", "onConfigurationChanged ejecutado sin reiniciar WebView.")
    }

    private fun showErrorUi(message: String) {
        runOnUiThread {
            errorTextView?.text = message
            errorOverlay?.visibility = View.VISIBLE
            progressBar?.visibility = View.GONE
        }
    }

    private fun hideErrorUi() {
        runOnUiThread {
            errorOverlay?.visibility = View.GONE
        }
    }

    private fun updateCustomerPresentationSafely() {
        try {
            val presentationDisplays = displayManager?.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION) ?: emptyArray()

            if (presentationDisplays.isNotEmpty()) {
                val secondaryDisplay = presentationDisplays[0]

                if (customerPresentation == null || customerPresentation?.display != secondaryDisplay) {
                    customerPresentation?.dismiss()
                    val customerUrl = "${TARGET_POS_URL}pantalla-cliente"

                    customerPresentation = CustomerPresentation(this, secondaryDisplay, customerUrl)
                    customerPresentation?.show()
                    Log.i("MainActivity", "✅ Pantalla secundaria cliente conectada exitosamente.")
                }
            } else {
                customerPresentation?.dismiss()
                customerPresentation = null
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Excepción no bloqueante en pantalla secundaria: ${e.message}")
        }
    }

    override fun onDisplayAdded(displayId: Int) {
        updateCustomerPresentationSafely()
    }

    override fun onDisplayRemoved(displayId: Int) {
        try {
            if (customerPresentation?.display?.displayId == displayId) {
                customerPresentation?.dismiss()
                customerPresentation = null
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Error al remover pantalla secundaria: ${e.message}")
        }
    }

    override fun onDisplayChanged(displayId: Int) {}

    override fun onDestroy() {
        super.onDestroy()
        try {
            displayManager?.unregisterDisplayListener(this)
            customerPresentation?.dismiss()
            customerPresentation = null
        } catch (e: Exception) {}
    }

    override fun onBackPressed() {
        if (primaryWebView?.canGoBack() == true) {
            primaryWebView?.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
