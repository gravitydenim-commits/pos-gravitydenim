package com.example.gravitydenimpos

import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.widget.Toast
import com.imin.printer.PrinterHelper
import org.json.JSONArray
import org.json.JSONObject

/**
 * WebAppInterface — Puente JavaScript ↔ Android nativo
 *
 * Integración de impresión: SDK oficial iMin IminPrinterLibrary V1.0.0.15
 * Dispositivo objetivo: iMin D4-504 (Android 11)
 */
class WebAppInterface(
    private val context: Context,
    private val onCustomerUpdateListener: ((String) -> Unit)? = null
) {
    // Instancia singleton del SDK oficial de iMin V1.0.x
    private val iminPrint = PrinterHelper.getInstance()

    // Estado de inicialización
    @Volatile
    private var printerReady = false

    // ─────────────────────────────────────────
    // INFORMACIÓN DEL DISPOSITIVO
    // ─────────────────────────────────────────

    @JavascriptInterface
    fun getDeviceModel(): String {
        return "iMin D4-504 (I20D01) — SDK: IminPrinterLibrary V1.0.0.15"
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
    // INICIALIZACIÓN DE IMPRESORA — SDK OFICIAL
    // ─────────────────────────────────────────

    @JavascriptInterface
    fun initPrinter(): String {
        return try {
            android.util.Log.i("WebAppInterface", "[IMIN-SDK] Iniciando initPrinterService")
            iminPrint.initPrinterService(context)
            Thread.sleep(1000)
            iminPrint.initPrinter("USB", null)
            printerReady = true
            android.util.Log.i("WebAppInterface", "[IMIN-SDK] initPrinter() completado — printerReady=true")
            "IMIN_SDK_INIT_OK — printerReady=true"
        } catch (e: Exception) {
            val err = "[IMIN-SDK] INIT_ERROR: ${e.javaClass.simpleName}: ${e.message}"
            android.util.Log.e("WebAppInterface", err, e)
            printerReady = false
            err
        }
    }

    // ─────────────────────────────────────────
    // ESTADO DE LA IMPRESORA
    // ─────────────────────────────────────────

    @JavascriptInterface
    fun getPrinterStatus(): String {
        return try {
            val status = iminPrint.getPrinterStatus()
            val msg = "[IMIN-SDK] getPrinterStatus() = $status | printerReady=$printerReady"
            android.util.Log.i("WebAppInterface", msg)
            msg
        } catch (e: Exception) {
            val err = "[IMIN-SDK] STATUS_ERROR: ${e.javaClass.simpleName}: ${e.message}"
            android.util.Log.e("WebAppInterface", err, e)
            err
        }
    }

    // ─────────────────────────────────────────
    // PRUEBA MÍNIMA — IMPRIME "PRUEBA GRAVITY DENIM"
    // ─────────────────────────────────────────

    @JavascriptInterface
    fun printTestTicket(): String {
        val log = StringBuilder()
        return try {
            android.util.Log.i("WebAppInterface", "[IMIN-SDK] === INICIO printTestTicket() ===")

            if (!printerReady) {
                log.append("[1] Llamando initPrinterService... ")
                iminPrint.initPrinterService(context)
                Thread.sleep(1000)
                iminPrint.initPrinter("USB", null)
                printerReady = true
                log.append("OK\n")
            }

            log.append("[2] setFontBold(true)... ")
            iminPrint.setFontBold(true)
            log.append("OK\n")

            log.append("[3] printTextWithAli(PRUEBA GRAVITY DENIM, 1)... ")
            iminPrint.printTextWithAli("PRUEBA GRAVITY DENIM\n\n", 1, null)
            log.append("OK\n")

            log.append("[4] setFontBold(false)... ")
            iminPrint.setFontBold(false)
            log.append("OK\n")
            
            log.append("[5] printText(--------------------------------)... ")
            iminPrint.printText("--------------------------------\n", null)

            log.append("[6] printAndFeedPaper(5)... ")
            iminPrint.printAndFeedPaper(5)
            log.append("OK\n")
            
            log.append("[RESULTADO] PRUEBA_EXITOSA — revisa si salió papel físicamente")
            val result = log.toString()
            android.util.Log.i("WebAppInterface", "[IMIN-SDK] $result")
            result

        } catch (e: Exception) {
            val err = "[IMIN-SDK] PRINT_TEST_ERROR:\n$log\nException: ${e.javaClass.simpleName}: ${e.message}"
            android.util.Log.e("WebAppInterface", err, e)
            err
        }
    }

    // ─────────────────────────────────────────
    // IMPRESIÓN REAL DE TICKETS
    // ─────────────────────────────────────────

    @JavascriptInterface
    fun printTicket(payloadJson: String): String {
        return try {
            if (!printerReady) {
                iminPrint.initPrinterService(context)
                Thread.sleep(1000)
                iminPrint.initPrinter("USB", null)
                printerReady = true
            }

            val payload = JSONObject(payloadJson)

            // ── ENCABEZADO ──
            iminPrint.setFontBold(true)
            val titulo = payload.optString("titulo", "GRAVITY DENIM")
            iminPrint.printTextWithAli("$titulo\n", 1, null)

            iminPrint.setFontBold(false)
            val subtitulo = payload.optString("subtitulo", "")
            if (subtitulo.isNotEmpty()) iminPrint.printTextWithAli("$subtitulo\n", 1, null)

            iminPrint.printTextWithAli("================================\n", 1, null)

            // ── DATOS DEL CLIENTE ──
            val fecha = payload.optString("fecha", "")
            val cliente = payload.optString("cliente", "")
            if (fecha.isNotEmpty()) iminPrint.printText("Fecha: $fecha\n", null)
            if (cliente.isNotEmpty()) iminPrint.printText("Cliente: $cliente\n", null)
            iminPrint.printText("--------------------------------\n", null)

            // ── ITEMS ──
            val items: JSONArray = payload.optJSONArray("items") ?: JSONArray()
            for (i in 0 until items.length()) {
                val item = items.getJSONObject(i)
                val desc = item.optString("descripcion", "Item")
                val qty = item.optInt("cantidad", 1)
                val precio = item.optDouble("precio", 0.0)
                val subtot = qty * precio
                
                iminPrint.printText("$desc\n", null)
                
                val qtyPrecio = "  ${qty} x ${"%.2f".format(precio)}"
                val subtotStr = "${"%.2f".format(subtot)}"
                val spaces = " ".repeat(maxOf(1, 32 - qtyPrecio.length - subtotStr.length))
                iminPrint.printText("$qtyPrecio$spaces$subtotStr\n", null)
            }

            iminPrint.printText("--------------------------------\n", null)

            // ── TOTALES ──
            val subtotal = payload.optDouble("subtotal", 0.0)
            val descuento = payload.optDouble("descuento", 0.0)
            val total = payload.optDouble("total", 0.0)
            val formaPago = payload.optString("formaPago", "")

            if (subtotal != total) {
                iminPrint.printText("Subtotal:          ${"%.2f".format(subtotal)}\n", null)
            }
            if (descuento > 0.0) {
                iminPrint.printText("Descuento:        -${"%.2f".format(descuento)}\n", null)
            }

            iminPrint.setFontBold(true)
            iminPrint.printText("TOTAL:             ${"%.2f".format(total)}\n", null)
            iminPrint.setFontBold(false)

            if (formaPago.isNotEmpty()) iminPrint.printText("Forma de Pago: $formaPago\n", null)

            // ── PIE ──
            iminPrint.printTextWithAli("================================\n", 1, null)
            val pie = payload.optString("pie", "Gracias por su compra")
            iminPrint.printTextWithAli("$pie\n", 1, null)

            // ── AVANCE DE PAPEL ──
            iminPrint.printAndFeedPaper(6)

            "TICKET_IMPRESO_OK"

        } catch (e: Exception) {
            val err = "[IMIN-SDK] PRINT_TICKET_ERROR: ${e.message}"
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
            if (!printerReady) {
                iminPrint.initPrinterService(context)
                Thread.sleep(1000)
                iminPrint.initPrinter("USB", null)
                printerReady = true
            }
            iminPrint.setFontBold(bold)
            iminPrint.printTextWithAli("$text\n", alignment, null)
            iminPrint.setFontBold(false)
            "PRINT_TEXT_OK"
        } catch (e: Exception) {
            "[IMIN-SDK] PRINT_TEXT_ERROR: ${e.message}"
        }
    }

    @JavascriptInterface
    fun feedPaper(lines: Int): String {
        return try {
            iminPrint.printAndFeedPaper(lines)
            "FEED_PAPER_OK"
        } catch (e: Exception) {
            "[IMIN-SDK] FEED_PAPER_ERROR: ${e.message}"
        }
    }

    @JavascriptInterface
    fun getInstalledIminPackages(): String {
        return try {
            val pm = context.packageManager
            val packages = pm.getInstalledPackages(0)
            val iminPkgs = packages.filter {
                it.packageName.contains("imin", ignoreCase = true) ||
                it.packageName.contains("print", ignoreCase = true) ||
                it.packageName.contains("pos", ignoreCase = true)
            }.map { "${it.packageName} (v${it.versionName})" }

            val result = StringBuilder()
            result.append("SDK EN USO: IminPrinterLibrary V1.0.0.15\n")
            result.append("Clase: com.imin.printer.PrinterHelper\n")
            result.append("printerReady=$printerReady\n\n")

            if (iminPkgs.isEmpty()) {
                result.append("No se encontraron paquetes imin/print/pos")
            } else {
                result.append("Paquetes relacionados:\n")
                iminPkgs.forEach { result.append("  $it\n") }
            }
            result.toString()
        } catch (e: Exception) {
            "[IMIN-SDK] DIAG_ERROR: ${e.message}"
        }
    }
}
