package com.example.gravitydenimpos

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import java.io.ByteArrayOutputStream

object UsbPrinterHelper {
    const val VID = 1305
    const val PID = 8211
    const val ACTION_USB_PERMISSION = "com.example.gravitydenimpos.USB_PERMISSION"

    fun getUsbDevice(context: Context): UsbDevice? {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        for (device in usbManager.deviceList.values) {
            if (device.vendorId == VID && device.productId == PID) {
                return device
            }
        }
        return null
    }

    fun hasPermission(context: Context, device: UsbDevice): Boolean {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        return usbManager.hasPermission(device)
    }

    fun requestPermission(context: Context, device: UsbDevice) {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val permissionIntent = PendingIntent.getBroadcast(
            context, 0, Intent(ACTION_USB_PERMISSION),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        )
        usbManager.requestPermission(device, permissionIntent)
    }

    fun printRawBytes(context: Context, device: UsbDevice, bytes: ByteArray): String {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        var connection: UsbDeviceConnection? = null
        var usbInterface: UsbInterface? = null
        var bulkOutEndpoint: UsbEndpoint? = null

        try {
            val interfaceCount = device.interfaceCount
            for (i in 0 until interfaceCount) {
                val iface = device.getInterface(i)
                var outEp: UsbEndpoint? = null
                for (j in 0 until iface.endpointCount) {
                    val ep = iface.getEndpoint(j)
                    if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK && 
                        ep.direction == UsbConstants.USB_DIR_OUT) {
                        outEp = ep
                    }
                }
                if (outEp != null) {
                    usbInterface = iface
                    bulkOutEndpoint = outEp
                    break
                }
            }

            if (usbInterface == null || bulkOutEndpoint == null) {
                return "ERROR: No se encontró interfaz o endpoint BULK OUT de impresora"
            }

            connection = usbManager.openDevice(device) ?: return "ERROR: No se pudo abrir la conexión USB"
            
            val claimed = connection.claimInterface(usbInterface, true)
            if (!claimed) {
                connection.close()
                return "ERROR: No se pudo reclamar la interfaz USB"
            }

            val result = connection.bulkTransfer(bulkOutEndpoint, bytes, bytes.size, 5000)
            
            connection.releaseInterface(usbInterface)
            connection.close()

            return if (result >= 0) "SUCCESS" else "ERROR: bulkTransfer devolvió $result"

        } catch (e: Exception) {
            Log.e("UsbPrinterHelper", "Error printing raw bytes: ${e.message}", e)
            try {
                connection?.close()
            } catch (ex: Exception) {}
            return "ERROR: Excepción: ${e.message}"
        }
    }
}

class EscPosBuilder {
    private val buffer = ByteArrayOutputStream()

    fun init(): EscPosBuilder {
        buffer.write(byteArrayOf(0x1B, 0x40))
        return this
    }

    fun align(alignMode: Int): EscPosBuilder {
        // 0 = left, 1 = center, 2 = right
        buffer.write(byteArrayOf(0x1B, 0x61, alignMode.toByte()))
        return this
    }

    fun bold(enable: Boolean): EscPosBuilder {
        buffer.write(byteArrayOf(0x1B, 0x45, if (enable) 1 else 0))
        return this
    }

    fun doubleSize(enable: Boolean): EscPosBuilder {
        buffer.write(byteArrayOf(0x1D, 0x21, if (enable) 0x11 else 0x00))
        return this
    }

    fun text(txt: String): EscPosBuilder {
        buffer.write(txt.toByteArray(Charsets.UTF_8))
        return this
    }

    fun barcode(code: String): EscPosBuilder {
        try {
            // GS h 80 (Altura = 80 dots)
            buffer.write(byteArrayOf(0x1D, 0x68, 80.toByte()))
            // GS w 2 (Factor de ancho = 2)
            buffer.write(byteArrayOf(0x1D, 0x77, 2.toByte()))
            // GS H 0 (No imprimir HRI caracteres debajo del código de barra)
            buffer.write(byteArrayOf(0x1D, 0x48, 0.toByte()))
            
            // GS k 73 (CODE128) L1 [data]
            // Iniciamos con subset B "{B"
            val content = "{B$code"
            val bytes = content.toByteArray(Charsets.US_ASCII)
            
            buffer.write(byteArrayOf(0x1D, 0x6B, 73.toByte(), bytes.size.toByte()))
            buffer.write(bytes)
        } catch (e: Exception) {
            Log.e("EscPosBuilder", "Error generating barcode: ${e.message}")
        }
        return this
    }

    fun qrCode(data: String): EscPosBuilder {
        try {
            val bytes = data.toByteArray(Charsets.UTF_8)
            val numBytes = bytes.size + 3
            val pL = (numBytes % 256).toByte()
            val pH = (numBytes / 256).toByte()

            // 1. Set QR model 2: GS ( k 4 0 49 65 50 0
            buffer.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00))

            // 2. Set dot size to 6: GS ( k 3 0 49 67 6
            buffer.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06))

            // 3. Set error correction level M: GS ( k 3 0 49 69 49
            buffer.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31))

            // 4. Store QR data: GS ( k pL pH 49 80 48 [data]
            buffer.write(byteArrayOf(0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30))
            buffer.write(bytes)

            // 5. Render/Print QR code: GS ( k 3 0 49 81 48
            buffer.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30))
        } catch (e: Exception) {
            Log.e("EscPosBuilder", "Error generating QR: ${e.message}")
        }
        return this
    }

    fun feed(lines: Int): EscPosBuilder {
        for (i in 0 until lines) {
            buffer.write(0x0A)
        }
        return this
    }

    fun cut(): EscPosBuilder {
        buffer.write(byteArrayOf(0x1D, 0x56, 0x00))
        return this
    }

    fun build(): ByteArray {
        return buffer.toByteArray()
    }
}
