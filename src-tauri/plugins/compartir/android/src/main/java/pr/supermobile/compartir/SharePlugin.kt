package pr.supermobile.compartir

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class ShareFileArgs {
    lateinit var path: String
    var mimeType: String = "image/jpeg"
    var title: String? = null
    var text: String? = null
}

@TauriPlugin
class SharePlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun shareFile(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(ShareFileArgs::class.java)
            val file = File(args.path)
            if (!file.exists()) {
                invoke.reject("No se encontró el archivo para compartir.")
                return
            }
            val uri = FileProvider.getUriForFile(activity, activity.packageName + ".compartir.fileprovider", file)
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
}
