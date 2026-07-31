package com.gravity.usbtest

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Bundle
import android.util.Log
import android.widget.Button
import android.widget.TextView
class MainActivity : Activity() {

    companion object {
        private const val TAG = "USB_PRINT_TEST"
        private const val ACTION_USB_PERMISSION = "com.gravity.usbtest.USB_PERMISSION"

        // iMin_80_Printer / MASUNG MS-SGE-W27
        // VID = 0x0519 = 1305 decimal
        // PID = 0x2013 = 8211 decimal
        private const val TARGET_VID = 0x0519
        private const val TARGET_PID = 0x2013

        // ─── ESC/POS commands ───────────────────────────────────────────
        private val CMD_INIT         = byteArrayOf(0x1B, 0x40)           // ESC @  — Initialize printer
        private val CMD_ALIGN_CENTER = byteArrayOf(0x1B, 0x61, 0x01)     // ESC a 1 — Align center
        private val CMD_ALIGN_LEFT   = byteArrayOf(0x1B, 0x61, 0x00)     // ESC a 0 — Align left
        private val CMD_BOLD_ON      = byteArrayOf(0x1B, 0x45, 0x01)     // ESC E 1 — Bold on
        private val CMD_BOLD_OFF     = byteArrayOf(0x1B, 0x45, 0x00)     // ESC E 0 — Bold off
        private val CMD_DOUBLE_HW    = byteArrayOf(0x1B, 0x21, 0x30)     // ESC ! 0x30 — Double height+width
        private val CMD_NORMAL_SIZE  = byteArrayOf(0x1B, 0x21, 0x00)     // ESC ! 0x00 — Normal size
        private val CMD_LF           = byteArrayOf(0x0A)                  // LF
        private val CMD_FEED_3       = byteArrayOf(0x1B, 0x64, 0x03)     // ESC d 3 — Feed 3 lines
        private val CMD_FEED_6       = byteArrayOf(0x1B, 0x64, 0x06)     // ESC d 6 — Feed 6 lines
        private val CMD_CUT_PARTIAL  = byteArrayOf(0x1D, 0x56, 0x42, 0x00) // GS V B 0 — Partial cut
        // ────────────────────────────────────────────────────────────────
    }

    private lateinit var usbManager: UsbManager
    private lateinit var tvLog: TextView
    private var targetDevice: UsbDevice? = null

    private val usbPermissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (ACTION_USB_PERMISSION == intent.action) {
                val device = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                log("► Permiso USB recibido para: ${device?.deviceName}")
                log("  Concedido: $granted")
                if (granted && device != null) {
                    executePrint(device)
                } else {
                    log("✗ PERMISO DENEGADO — no se puede acceder al dispositivo USB")
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        usbManager = getSystemService(Context.USB_SERVICE) as UsbManager
        tvLog = findViewById(R.id.tvLog)

        registerReceiver(
            usbPermissionReceiver,
            IntentFilter(ACTION_USB_PERMISSION),
            RECEIVER_NOT_EXPORTED
        )

        findViewById<Button>(R.id.btnScan).setOnClickListener { scanUsbDevices() }
        findViewById<Button>(R.id.btnPrint).setOnClickListener { requestPrintPermission() }

        // Si la app fue lanzada por un evento USB_DEVICE_ATTACHED, escanear inmediatamente
        if (intent?.action == "android.hardware.usb.action.USB_DEVICE_ATTACHED") {
            log("App lanzada por evento USB_DEVICE_ATTACHED")
            scanUsbDevices()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try { unregisterReceiver(usbPermissionReceiver) } catch (_: Exception) {}
    }

    // ─── 1. SCAN ─────────────────────────────────────────────────────────

    private fun scanUsbDevices() {
        tvLog.text = ""
        log("=== ESCANEO DE DISPOSITIVOS USB ===")
        val deviceList = usbManager.deviceList

        if (deviceList.isEmpty()) {
            log("✗ No se encontraron dispositivos USB conectados")
            return
        }

        log("Total dispositivos USB: ${deviceList.size}\n")

        deviceList.values.forEach { device ->
            val vid = device.vendorId
            val pid = device.productId
            val vidHex = "0x%04X".format(vid)
            val pidHex = "0x%04X".format(pid)
            val isTarget = (vid == TARGET_VID && pid == TARGET_PID)
            val marker = if (isTarget) " ◄ OBJETIVO" else ""

            log("──────────────────────────────")
            log("Nombre:       ${device.deviceName}$marker")
            log("ProductName:  ${device.productName ?: "N/A"}")
            log("Manufacturer: ${device.manufacturerName ?: "N/A"}")
            log("VID:          $vidHex ($vid)")
            log("PID:          $pidHex ($pid)")
            log("Clase:        ${device.deviceClass}")
            log("Interfaces:   ${device.interfaceCount}")

            for (i in 0 until device.interfaceCount) {
                val iface = device.getInterface(i)
                log("  Interfaz[$i]: clase=${iface.interfaceClass} endpoints=${iface.endpointCount}")
                for (e in 0 until iface.endpointCount) {
                    val ep = iface.getEndpoint(e)
                    val dir = if (ep.direction == UsbConstants.USB_DIR_OUT) "OUT" else "IN"
                    val type = when (ep.type) {
                        UsbConstants.USB_ENDPOINT_XFER_BULK -> "BULK"
                        UsbConstants.USB_ENDPOINT_XFER_INT  -> "INTERRUPT"
                        else -> "type=${ep.type}"
                    }
                    log("    Endpoint[$e]: $dir $type addr=${ep.address} maxPkt=${ep.maxPacketSize}")
                }
            }

            if (isTarget) {
                targetDevice = device
                log("✓ Impresora objetivo encontrada: ${device.productName}")
            }
        }

        log("──────────────────────────────")
        if (targetDevice != null) {
            log("✓ Dispositivo objetivo listo. Presiona 'Imprimir'.")
        } else {
            log("✗ No se encontró VID=0x0519 / PID=0x2013")
            log("  Verifica los VID/PID en la lista de arriba.")
        }
    }

    // ─── 2. REQUEST PERMISSION ───────────────────────────────────────────

    private fun requestPrintPermission() {
        log("\n=== SOLICITAR PERMISO USB ===")
        val device = targetDevice
        if (device == null) {
            log("✗ Primero ejecuta 'Escanear dispositivos USB'")
            scanUsbDevices()
            return
        }

        log("Dispositivo: ${device.productName} (${device.deviceName})")

        if (usbManager.hasPermission(device)) {
            log("✓ Permiso ya concedido — imprimiendo directamente...")
            executePrint(device)
        } else {
            log("Solicitando permiso USB al usuario...")
            val permIntent = PendingIntent.getBroadcast(
                this, 0,
                Intent(ACTION_USB_PERMISSION),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            usbManager.requestPermission(device, permIntent)
        }
    }

    // ─── 3. PRINT ────────────────────────────────────────────────────────

    private fun executePrint(device: UsbDevice) {
        log("\n=== IMPRESIÓN DIRECTA ESC/POS ===")
        log("Dispositivo: ${device.productName}")

        // Buscar interfaz de impresión (clase 7 = Printer, o clase 0 = Vendor-specific)
        var printInterface: UsbInterface? = null
        var bulkOut: UsbEndpoint? = null

        for (i in 0 until device.interfaceCount) {
            val iface = device.getInterface(i)
            log("Revisando interfaz[$i]: clase=${iface.interfaceClass}")
            for (e in 0 until iface.endpointCount) {
                val ep = iface.getEndpoint(e)
                if (ep.direction == UsbConstants.USB_DIR_OUT &&
                    ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                    printInterface = iface
                    bulkOut = ep
                    log("✓ Endpoint BULK OUT encontrado: addr=${ep.address} maxPkt=${ep.maxPacketSize}")
                    break
                }
            }
            if (bulkOut != null) break
        }

        if (printInterface == null || bulkOut == null) {
            log("✗ No se encontró endpoint BULK OUT en ninguna interfaz")
            log("  Impresora no accesible vía USB Host API")
            return
        }

        val connection: UsbDeviceConnection? = usbManager.openDevice(device)
        if (connection == null) {
            log("✗ openDevice() devolvió null — sin permisos o dispositivo ocupado")
            return
        }
        log("✓ Conexión USB abierta: ${connection.serial ?: "serial N/A"}")

        val claimed = connection.claimInterface(printInterface, true)
        log("claimInterface: ${if (claimed) "✓ OK" else "✗ FALLÓ"}")
        if (!claimed) {
            connection.close()
            return
        }

        // ─── Construir payload ESC/POS ────────────────────────────────
        val payload = buildEscPosPayload()
        log("Payload ESC/POS: ${payload.size} bytes")

        // Enviar en bloques de 512 bytes (max packet size)
        val CHUNK = bulkOut.maxPacketSize
        var offset = 0
        var totalSent = 0
        var errorCount = 0

        while (offset < payload.size) {
            val len = minOf(CHUNK, payload.size - offset)
            val chunk = payload.copyOfRange(offset, offset + len)
            val sent = connection.bulkTransfer(bulkOut, chunk, chunk.size, 3000)
            if (sent < 0) {
                log("✗ bulkTransfer() devolvió $sent en offset=$offset (ERROR)")
                errorCount++
                if (errorCount >= 3) {
                    log("✗ Demasiados errores, abortando")
                    break
                }
            } else {
                totalSent += sent
                Log.d(TAG, "bulkTransfer: enviados $sent bytes (offset=$offset)")
            }
            offset += len
        }

        log("─────────────────────────────")
        log("Total bytes enviados: $totalSent / ${payload.size}")
        if (totalSent == payload.size && errorCount == 0) {
            log("✓ TODOS LOS BYTES ENVIADOS CORRECTAMENTE")
            log("  → Verifica si salió papel físicamente")
        } else {
            log("✗ Solo se enviaron $totalSent/${payload.size} bytes ($errorCount errores)")
        }

        connection.releaseInterface(printInterface)
        connection.close()
        log("Conexión USB cerrada.")
    }

    // ─── ESC/POS payload ─────────────────────────────────────────────────

    private fun buildEscPosPayload(): ByteArray {
        val buf = mutableListOf<Byte>()

        fun add(vararg arrays: ByteArray) = arrays.forEach { buf.addAll(it.toList()) }
        fun addText(text: String) = buf.addAll(text.toByteArray(Charsets.US_ASCII).toList())

        // Inicializar
        add(CMD_INIT)

        // Encabezado en negrita centrado
        add(CMD_ALIGN_CENTER, CMD_BOLD_ON, CMD_DOUBLE_HW)
        addText("PRUEBA GRAVITY DENIM\n")
        add(CMD_NORMAL_SIZE, CMD_BOLD_OFF)

        // Línea separadora
        add(CMD_ALIGN_LEFT)
        addText("--------------------------------\n")

        // Contenido
        addText("Hardware: MS-SGE-W27 (MASUNG)\n")
        addText("VID: 0x0519  PID: 0x2013\n")
        addText("Protocolo: USB Host ESC/POS\n")
        addText("--------------------------------\n")

        // Segunda línea centrada
        add(CMD_ALIGN_CENTER, CMD_BOLD_ON)
        addText("HELLO WORLD\n")
        add(CMD_BOLD_OFF)

        // Avanzar papel y cortar
        add(CMD_FEED_6)
        add(CMD_CUT_PARTIAL)

        return buf.toByteArray()
    }

    // ─── Utilidad de log ──────────────────────────────────────────────────

    private fun log(msg: String) {
        Log.i(TAG, msg)
        runOnUiThread {
            tvLog.append("$msg\n")
        }
    }
}
