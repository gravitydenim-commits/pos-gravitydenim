package com.example.gravitydenimpos

import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import android.hardware.usb.UsbDevice

/**
 * WebAppInterface — Puente JavaScript ↔ Android nativo
 *
 * Integración de impresión directa mediante USB ESC/POS.
 * Sin dependencias del SDK oficial de iMin para evitar fallos.
 */
class WebAppInterface(
    private val context: Context,
    private val onCustomerUpdateListener: ((String) -> Unit)? = null
) {

    // ─────────────────────────────────────────
    // INFORMACIÓN DEL DISPOSITIVO
    // ─────────────────────────────────────────

    @JavascriptInterface
    fun getDeviceModel(): String {
        return "iMin D4-504 (I20D01) — USB Directo ESC/POS Masung"
    }

    @JavascriptInterface
    fun isDualScreenAvailable(): Boolean {
        val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        val presentationDisplays = displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)
        return presentationDisplays.isNotEmpty()
    }

    @JavascriptInterface
    fun notifyCustomerScreen(payloadJson: String) {
        onCustomerUpdateListener?.invoke(payloadJson)
    }

    @JavascriptInterface
    fun showToast(message: String) {
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }

    // ─────────────────────────────────────────
    // INICIALIZACIÓN DE IMPRESORA — USB DIRECTO
    // ─────────────────────────────────────────

    @JavascriptInterface
    fun initPrinter(): String {
        val device = UsbPrinterHelper.getUsbDevice(context)
        return if (device != null) {
            if (UsbPrinterHelper.hasPermission(context, device)) {
                "USB_PRINTER_READY"
            } else {
                UsbPrinterHelper.requestPermission(context, device)
                "USB_PRINTER_PERMISSION_REQUESTED"
            }
        } else {
            "USB_PRINTER_NOT_FOUND"
        }
    }

    // ─────────────────────────────────────────
    // ESTADO DE LA IMPRESORA
    // ─────────────────────────────────────────

    @JavascriptInterface
    fun getPrinterStatus(): String {
        val device = UsbPrinterHelper.getUsbDevice(context)
        return if (device != null) {
            val hasPerm = UsbPrinterHelper.hasPermission(context, device)
            "USB_DETECTED | Permission=$hasPerm"
        } else {
            "USB_NOT_FOUND"
        }
    }

    // ─────────────────────────────────────────
    // PRUEBA MÍNIMA — IMPRIME "PRUEBA GRAVITY DENIM"
    // ─────────────────────────────────────────

    @JavascriptInterface
    fun printTestTicket(): String {
        return try {
            val device = UsbPrinterHelper.getUsbDevice(context) ?: return "ERROR: Impresora no encontrada"
            if (!UsbPrinterHelper.hasPermission(context, device)) {
                UsbPrinterHelper.requestPermission(context, device)
                return "ERROR: Sin permiso USB"
            }

            val builder = EscPosBuilder().init()
                .bold(true)
                .align(1)
                .text("PRUEBA GRAVITY DENIM\n\n")
                .bold(false)
                .text("--------------------------------\n")
                .feed(5)
                .cut()

            val bytes = builder.build()
            val result = UsbPrinterHelper.printRawBytes(context, device, bytes)
            if (result == "SUCCESS") "TICKET_IMPRESO_OK" else result
        } catch (e: Exception) {
            "ERROR: ${e.message}"
        }
    }

    // ─────────────────────────────────────────
    // IMPRESIÓN REAL DE TICKETS
    // ─────────────────────────────────────────

    @JavascriptInterface
    fun printTicket(payloadJson: String): String {
        return try {
            val device = UsbPrinterHelper.getUsbDevice(context) ?: return "ERROR: Impresora no encontrada"
            if (!UsbPrinterHelper.hasPermission(context, device)) {
                UsbPrinterHelper.requestPermission(context, device)
                return "ERROR: Sin permiso USB"
            }

            val payload = JSONObject(payloadJson)
            val builder = EscPosBuilder().init()

            // Si hay un arreglo de líneas pre-formateadas (generado por printTicket.js o iminPrinter.js)
            val linesArray = payload.optJSONArray("lines")
            if (linesArray != null) {
                for (i in 0 until linesArray.length()) {
                    val lineObj = linesArray.getJSONObject(i)
                    var text = lineObj.optString("text", "")
                    
                    // Compactamos: omitimos saltos de línea innecesarios de espaciado
                    if (text.trim().isEmpty()) {
                        continue
                    }
                    
                    val align = lineObj.optInt("align", 0) // 0=left, 1=center, 2=right
                    val size = lineObj.optInt("size", 18)
                    val bold = lineObj.optBoolean("bold", false)

                    builder.align(align).bold(bold)
                    if (size >= 24) {
                        builder.doubleSize(true)
                    } else {
                        builder.doubleSize(false)
                    }
                    
                    if (!text.endsWith("\n")) {
                        text += "\n"
                    }
                    builder.text(text)
                }

                // Generación de Barcode/QR si viene la clave de acceso en el payload
                val numeroComprobante = payload.optString("numeroComprobante", "")
                val isNotaVenta = payload.optBoolean("isNotaVenta", false)

                if (numeroComprobante.isNotEmpty()) {
                    builder.align(1)
                    if (!isNotaVenta && numeroComprobante.length == 49) {
                        // Código de barras (Clave de Acceso)
                        builder.text("\nCÓDIGO DE BARRAS SRI:\n")
                        builder.barcode(numeroComprobante)

                        // Texto "CLAVE DE ACCESO SRI" y QR directamente debajo sin feeds
                        builder.text("\nCLAVE DE ACCESO SRI:\n")
                        val qrUrl = "https://declaraciones.sri.gob.ec/comprobantes-electronicos-internet/publico/detalleComprobante.jsf?claveAcceso=$numeroComprobante"
                        builder.qrCode(qrUrl)
                        builder.text("\nEscanea para verificar en el SRI\n")
                    } else if (isNotaVenta) {
                        // Nota de Venta
                        builder.text("\nNº Venta: $numeroComprobante\n")
                        if (numeroComprobante.matches(Regex("[0-9A-Za-z-]+"))) {
                            builder.barcode(numeroComprobante)
                        }
                    }
                }

                builder.feed(4).cut()
            } else {
                // Fallback de parseo del payload antiguo
                builder.align(1).bold(true)
                val titulo = payload.optString("titulo", "GRAVITY DENIM")
                builder.text("$titulo\n")

                builder.bold(false)
                val subtitulo = payload.optString("subtitulo", "")
                if (subtitulo.isNotEmpty()) builder.text("$subtitulo\n")

                builder.text("================================\n")

                builder.align(0)
                val fecha = payload.optString("fecha", "")
                val cliente = payload.optString("cliente", "")
                if (fecha.isNotEmpty()) builder.text("Fecha: $fecha\n")
                if (cliente.isNotEmpty()) builder.text("Cliente: $cliente\n")
                builder.text("--------------------------------\n")

                val items: JSONArray = payload.optJSONArray("items") ?: JSONArray()
                for (i in 0 until items.length()) {
                    val item = items.getJSONObject(i)
                    val desc = item.optString("descripcion", "Item")
                    val qty = item.optInt("cantidad", 1)
                    val precio = item.optDouble("precio", 0.0)
                    val subtot = qty * precio
                    
                    builder.text("$desc\n")
                    
                    val qtyPrecio = "  ${qty} x ${"%.2f".format(precio)}"
                    val subtotStr = "${"%.2f".format(subtot)}"
                    val spaces = " ".repeat(maxOf(1, 32 - qtyPrecio.length - subtotStr.length))
                    builder.text("$qtyPrecio$spaces$subtotStr\n")
                }

                builder.text("--------------------------------\n")

                val subtotal = payload.optDouble("subtotal", 0.0)
                val descuento = payload.optDouble("descuento", 0.0)
                val total = payload.optDouble("total", 0.0)
                val formaPago = payload.optString("formaPago", "")

                if (subtotal != total) {
                    builder.text("Subtotal:          ${"%.2f".format(subtotal)}\n")
                }
                if (descuento > 0.0) {
                    builder.text("Descuento:        -${"%.2f".format(descuento)}\n")
                }

                builder.bold(true)
                builder.text("TOTAL:             ${"%.2f".format(total)}\n")
                builder.bold(false)

                if (formaPago.isNotEmpty()) builder.text("Forma de Pago: $formaPago\n")

                builder.align(1)
                builder.text("================================\n")
                val pie = payload.optString("pie", "Gracias por su compra")
                builder.text("$pie\n")

                builder.feed(6).cut()
            }

            val bytes = builder.build()
            val result = UsbPrinterHelper.printRawBytes(context, device, bytes)

            if (result == "SUCCESS") "TICKET_IMPRESO_OK" else result

        } catch (e: Exception) {
            val err = "[USB-DIRECT] PRINT_TICKET_ERROR: ${e.message}"
            android.util.Log.e("WebAppInterface", err, e)
            err
        }
    }

    // ─────────────────────────────────────────
    // MÉTODOS DE TEXTO INDIVIDUALES
    // ─────────────────────────────────────────

    @JavascriptInterface
    fun printText(text: String, alignment: Int, textSize: Int, bold: Boolean): String {
        return try {
            val device = UsbPrinterHelper.getUsbDevice(context) ?: return "ERROR: Impresora no encontrada"
            if (!UsbPrinterHelper.hasPermission(context, device)) {
                UsbPrinterHelper.requestPermission(context, device)
                return "ERROR: Sin permiso USB"
            }

            val builder = EscPosBuilder().init()
            builder.align(alignment)
            builder.bold(bold)
            if (textSize > 1) {
                builder.doubleSize(true)
            } else {
                builder.doubleSize(false)
            }
            builder.text("$text\n")
            
            val bytes = builder.build()
            val result = UsbPrinterHelper.printRawBytes(context, device, bytes)
            if (result == "SUCCESS") "PRINT_TEXT_OK" else result
        } catch (e: Exception) {
            "[USB-DIRECT] PRINT_TEXT_ERROR: ${e.message}"
        }
    }

    @JavascriptInterface
    fun feedPaper(lines: Int): String {
        return try {
            val device = UsbPrinterHelper.getUsbDevice(context) ?: return "ERROR: Impresora no encontrada"
            if (!UsbPrinterHelper.hasPermission(context, device)) {
                return "ERROR: Sin permiso USB"
            }

            val builder = EscPosBuilder().init().feed(lines)
            val bytes = builder.build()
            val result = UsbPrinterHelper.printRawBytes(context, device, bytes)
            if (result == "SUCCESS") "FEED_PAPER_OK" else result
        } catch (e: Exception) {
            "[USB-DIRECT] FEED_PAPER_ERROR: ${e.message}"
        }
    }

    @JavascriptInterface
    fun getInstalledIminPackages(): String {
        return "IMPRESORA DIRECTA USB HABILITADA (SIN DEPENDENCIAS DEL SDK DE IMIN)"
    }

    @JavascriptInterface
    fun testNativePrintKotlinDirect(): String {
        return printTestTicket()
    }
}
