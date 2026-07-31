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
import android.hardware.usb.UsbManager
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbConstants
import android.app.PendingIntent
import android.content.Intent
import android.content.IntentFilter
import android.content.BroadcastReceiver
import android.widget.Toast

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

        try {
            Log.i("MainActivity", "[IMIN-SDK] Iniciando bindService en hilo principal (onCreate)")
            com.imin.printer.PrinterHelper.getInstance().initPrinterService(this, object : com.imin.printer.InitPrinterCallback {
                override fun onConnected() {
                    Log.i("MainActivity", "[IMIN-SDK] SERVICIO DE IMPRESORA CONECTADO EXITOSAMENTE")
                }
                override fun onDisconnected() {
                    Log.w("MainActivity", "[IMIN-SDK] SERVICIO DE IMPRESORA DESCONECTADO")
                }
            })
        } catch (e: Exception) {
            Log.e("MainActivity", "Error initPrinterService en onCreate: ${e.message}")
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

        // Registrar receptor de permiso USB
        registerReceiver(usbReceiver, IntentFilter("com.example.gravitydenimpos.USB_PERMISSION"))

        // Botón temporal TEST USB DIRECTO MASUNG
        val testMasungBtn = Button(this).apply {
            text = "TEST USB DIRECTO MASUNG"
            textSize = 11f
            setPadding(16, 8, 16, 8)
            setBackgroundColor(0xFFDC2626.toInt()) // Rojo
            setTextColor(0xFFFFFFFF.toInt())
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.BOTTOM or Gravity.END
                setMargins(0, 0, 32, 100) // Posicionar sobre esquina inferior derecha
            }
            setOnClickListener {
                runDirectMasungUsbPrintTest()
            }
        }
        rootLayout?.addView(testMasungBtn)

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
            unregisterReceiver(usbReceiver)
        } catch (e: Exception) {}
        try {
            Log.i("MainActivity", "[IMIN-SDK] Desvinculando servicio (onDestroy)")
            com.imin.printer.PrinterHelper.getInstance().deInitPrinterService(this)
        } catch (e: Exception) {
            Log.e("MainActivity", "Error deInitPrinterService: ${e.message}")
        }
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

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action
            if ("com.example.gravitydenimpos.USB_PERMISSION" == action) {
                synchronized(this) {
                    val device: UsbDevice? = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        device?.let {
                            performDirectUsbPrint(it)
                        }
                    } else {
                        Log.d("MainActivity", "Permiso denegado para el dispositivo $device")
                        showDiagDialog("Permiso denegado", "El usuario denegó el permiso para usar la impresora USB.")
                    }
                }
            }
        }
    }

    private fun showDiagDialog(title: String, message: String) {
        runOnUiThread {
            try {
                android.app.AlertDialog.Builder(this)
                    .setTitle(title)
                    .setMessage(message)
                    .setPositiveButton("OK", null)
                    .show()
            } catch (e: Exception) {
                Log.e("MainActivity", "Error mostrando diálogo: ${e.message}")
                Toast.makeText(this, "$title: $message", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun runDirectMasungUsbPrintTest() {
        val usbManager = getSystemService(Context.USB_SERVICE) as UsbManager
        val deviceList = usbManager.deviceList
        var targetDevice: UsbDevice? = null
        
        for (device in deviceList.values) {
            // VID 1305 (0x0519), PID 8211 (0x2013)
            if (device.vendorId == 1305 && device.productId == 8211) {
                targetDevice = device
                break
            }
        }

        if (targetDevice == null) {
            showDiagDialog(
                "Impresora no encontrada", 
                "No se encontró ningún dispositivo USB con VID 1305 y PID 8211.\n\nDispositivos conectados:\n" +
                deviceList.values.joinToString("\n") { "VID=${it.vendorId} PID=${it.productId} Name=${it.deviceName}" }
            )
            return
        }

        if (!usbManager.hasPermission(targetDevice)) {
            val permissionIntent = PendingIntent.getBroadcast(
                this, 0, Intent("com.example.gravitydenimpos.USB_PERMISSION"),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            )
            usbManager.requestPermission(targetDevice, permissionIntent)
        } else {
            performDirectUsbPrint(targetDevice)
        }
    }

    private fun performDirectUsbPrint(device: UsbDevice) {
        val usbManager = getSystemService(Context.USB_SERVICE) as UsbManager
        val diagLog = java.lang.StringBuilder()
        diagLog.append("=== DIAGNÓSTICO IMPRESIÓN DIRECTA USB ===\n")
        diagLog.append("Dispositivo: ${device.deviceName}\n")
        diagLog.append("VID: ${device.vendorId} (0x${Integer.toHexString(device.vendorId)})\n")
        diagLog.append("PID: ${device.productId} (0x${Integer.toHexString(device.productId)})\n")

        var connection: UsbDeviceConnection? = null
        var usbInterface: UsbInterface? = null
        var bulkOutEndpoint: UsbEndpoint? = null

        try {
            val interfaceCount = device.interfaceCount
            diagLog.append("Interfaces encontradas: $interfaceCount\n")
            
            for (i in 0 until interfaceCount) {
                val iface = device.getInterface(i)
                diagLog.append("Interfaz $i: class=${iface.interfaceClass}, subclass=${iface.interfaceSubclass}\n")
                
                var outEp: UsbEndpoint? = null
                for (j in 0 until iface.endpointCount) {
                    val ep = iface.getEndpoint(j)
                    diagLog.append("  EP $j: type=${ep.type}, dir=${ep.direction}\n")
                    if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK && 
                        ep.direction == UsbConstants.USB_DIR_OUT) {
                        outEp = ep
                    }
                }
                if (outEp != null) {
                    usbInterface = iface
                    bulkOutEndpoint = outEp
                    diagLog.append("-> Seleccionada Interfaz $i y EP Bulk Out\n")
                    break
                }
            }

            if (usbInterface == null || bulkOutEndpoint == null) {
                diagLog.append("ERROR: No se encontró interfaz o endpoint BULK OUT adecuado.\n")
                showDiagDialog("Error de Interface/Endpoint", diagLog.toString())
                return
            }

            connection = usbManager.openDevice(device)
            if (connection == null) {
                diagLog.append("ERROR: No se pudo abrir la conexión con el dispositivo USB.\n")
                showDiagDialog("Error de Conexión", diagLog.toString())
                return
            }

            val claimRes = connection.claimInterface(usbInterface, true)
            diagLog.append("Reclamar interfaz: $claimRes\n")
            if (!claimRes) {
                diagLog.append("ERROR: Falló al reclamar la interfaz USB.\n")
                showDiagDialog("Error al Reclamar Interfaz", diagLog.toString())
                connection.close()
                return
            }

            val escInit = byteArrayOf(0x1B, 0x40) // ESC @ (Inicializar)
            val printText = "PRUEBA GRAVITY DENIM\n".toByteArray(Charsets.UTF_8)
            val escFeed = byteArrayOf(0x0A, 0x0A, 0x0A, 0x0A, 0x0A) // LF * 5
            val escCut = byteArrayOf(0x1D, 0x56, 0x00) // GS V 0 (Corte)

            val bytesToSend = escInit + printText + escFeed + escCut
            diagLog.append("Total de bytes a enviar: ${bytesToSend.size}\n")

            val result = connection.bulkTransfer(bulkOutEndpoint, bytesToSend, bytesToSend.size, 5000)
            diagLog.append("Resultado de bulkTransfer(): $result\n")

            if (result >= 0) {
                diagLog.append("🎉 ¡ÉXITO! Se enviaron $result bytes a la impresora.\n")
                showDiagDialog("Prueba Exitosa", diagLog.toString())
            } else {
                diagLog.append("❌ ERROR en bulkTransfer(): código $result\n")
                showDiagDialog("Error en Bulk Transfer", diagLog.toString())
            }

            connection.releaseInterface(usbInterface)
            connection.close()

        } catch (e: Exception) {
            diagLog.append("EXCEPCIÓN: ${e.message}\n")
            Log.e("MainActivity", "Error en performDirectUsbPrint: ${e.message}", e)
            showDiagDialog("Excepción de Conexión", diagLog.toString())
            try {
                connection?.close()
            } catch (ex: Exception) {}
        }
    }
}
