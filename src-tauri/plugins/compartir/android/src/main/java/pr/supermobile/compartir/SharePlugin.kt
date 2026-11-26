package pr.supermobile.compartir

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Telephony
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class ShareFileArgs {
    lateinit var path: String
    var mimeType: String = "image/jpeg"
    var title: String? = null
    var text: String? = null
}

@InvokeArg
class DirectArgs {
    lateinit var path: String
    lateinit var phone: String
    var text: String? = null
    var app: String? = null
}

@InvokeArg
class ChatArgs {
    lateinit var phone: String
    var text: String? = null
    var app: String? = null
}

@TauriPlugin
class SharePlugin(private val activity: Activity) : Plugin(activity) {

    private fun whatsappPackage(app: String?): String? {
        val order = if (app == "business") listOf("com.whatsapp.w4b", "com.whatsapp") else listOf("com.whatsapp", "com.whatsapp.w4b")
        return order.firstOrNull { installed(it) }
    }

    /** Deja la imagen copiada para pegarla (Mantener el dedo › Pegar) si la otra app no la pone sola. */
    private fun copyImage(uri: Uri, pkg: String?) {
        try {
            if (pkg != null) activity.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            val cm = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newUri(activity.contentResolver, "Factura", uri))
        } catch (e: Exception) {
            // Sin portapapeles: la imagen igual queda guardada en el teléfono.
        }
    }

    private fun uriFor(path: String): Uri? {
        val file = File(path)
        if (!file.exists()) return null
        return FileProvider.getUriForFile(activity, activity.packageName + ".compartir.fileprovider", file)
    }

    @Suppress("DEPRECATION")
    private fun installed(pkg: String): Boolean {
        return try {
            activity.packageManager.getPackageInfo(pkg, 0)
            true
        } catch (e: Exception) {
            false
        }
    }

    @Command
    fun shareFile(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(ShareFileArgs::class.java)
            val uri = uriFor(args.path)
            if (uri == null) {
                invoke.reject("No se encontró el archivo para compartir.")
                return
            }
            val send = Intent(Intent.ACTION_SEND).apply {
                type = args.mimeType
                putExtra(Intent.EXTRA_STREAM, uri)
                args.text?.let { putExtra(Intent.EXTRA_TEXT, it) }
                clipData = ClipData.newRawUri("", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(send, args.title ?: "Compartir")
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            activity.startActivity(chooser)
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("No se pudo compartir: " + (e.message ?: e.toString()))
        }
    }

    @Command
    fun whatsappApps(invoke: Invoke) {
        val ret = JSObject()
        ret.put("whatsapp", installed("com.whatsapp"))
        ret.put("business", installed("com.whatsapp.w4b"))
        invoke.resolve(ret)
    }

    /** Abre el chat de WhatsApp del número (solo dígitos con código de país) con la imagen adjunta. */
    @Command
    fun shareWhatsApp(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(DirectArgs::class.java)
            val uri = uriFor(args.path)
            if (uri == null) {
                invoke.reject("No se encontró la imagen de la factura.")
                return
            }
            val pkg = whatsappPackage(args.app)
            if (pkg == null) {
                invoke.reject("WhatsApp no está instalado en este teléfono.")
                return
            }
            val digits = args.phone.filter { it.isDigit() }
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "image/jpeg"
                setPackage(pkg)
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra("jid", "$digits@s.whatsapp.net")
                args.text?.let { putExtra(Intent.EXTRA_TEXT, it) }
                clipData = ClipData.newRawUri("", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(send)
            invoke.resolve()
        } catch (e: ActivityNotFoundException) {
            invoke.reject("WhatsApp no está instalado en este teléfono.")
        } catch (e: Exception) {
            invoke.reject("No se pudo abrir WhatsApp: " + (e.message ?: e.toString()))
        }
    }

    /** Abre el chat de WhatsApp de CUALQUIER número (aunque no esté en tus contactos ni tengas chat con él),
     *  con el texto ya escrito. WhatsApp no deja adjuntar una imagen por este camino. */
    @Command
    fun openWhatsAppChat(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(ChatArgs::class.java)
            val pkg = whatsappPackage(args.app)
            if (pkg == null) {
                invoke.reject("WhatsApp no está instalado en este teléfono.")
                return
            }
            val digits = args.phone.filter { it.isDigit() }
            val text = args.text?.takeIf { it.isNotBlank() }
            val url = "https://api.whatsapp.com/send?phone=" + digits + (if (text != null) "&text=" + Uri.encode(text) else "")
            val view = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply { setPackage(pkg) }
            activity.startActivity(view)
            invoke.resolve()
        } catch (e: ActivityNotFoundException) {
            invoke.reject("WhatsApp no está instalado en este teléfono.")
        } catch (e: Exception) {
            invoke.reject("No se pudo abrir WhatsApp: " + (e.message ?: e.toString()))
        }
    }

    /** Abre la conversación del número en la app de Mensajes (Samsung, Google…) con el texto escrito.
     *  La imagen se intenta adjuntar y además queda copiada para pegarla si la app no la pone sola. */
    @Command
    fun shareSms(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(DirectArgs::class.java)
            val uri = uriFor(args.path)
            if (uri == null) {
                invoke.reject("No se encontró la imagen de la factura.")
                return
            }
            val phone = args.phone.filter { it.isDigit() || it == '+' }
            val smsApp = Telephony.Sms.getDefaultSmsPackage(activity)
            copyImage(uri, smsApp)
            val open = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$phone")).apply {
                if (smsApp != null) setPackage(smsApp)
                putExtra("sms_body", args.text ?: "")
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = ClipData.newRawUri("", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            try {
                activity.startActivity(open)
            } catch (e: ActivityNotFoundException) {
                open.setPackage(null)
                activity.startActivity(open)
            }
            val ret = JSObject()
            ret.put("copied", true)
            invoke.resolve(ret)
        } catch (e: Exception) {
            invoke.reject("No se pudo abrir Mensajes: " + (e.message ?: e.toString()))
        }
    }
}
