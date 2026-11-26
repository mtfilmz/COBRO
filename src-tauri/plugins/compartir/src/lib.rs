//! Compartir la factura en Android: menú Compartir, WhatsApp directo al número y mensaje de texto (MMS).
use serde::Serialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "android")]
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ShareArgs {
    path: String,
    mime_type: String,
    title: Option<String>,
    text: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectArgs {
    path: String,
    phone: String,
    text: Option<String>,
    app: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatArgs {
    phone: String,
    text: Option<String>,
    app: Option<String>,
}

#[cfg(target_os = "android")]
struct Compartir<R: Runtime>(tauri::plugin::PluginHandle<R>);

fn run<R: Runtime, T: Serialize>(
    app: &tauri::AppHandle<R>,
    cmd: &str,
    args: T,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        let handle = app.state::<Compartir<R>>();
        handle
            .0
            .run_mobile_plugin::<serde_json::Value>(cmd, args)
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, cmd, args);
        Err("Esto solo está disponible en Android.".into())
    }
}

#[tauri::command]
async fn share_file<R: Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    mime_type: String,
    title: Option<String>,
    text: Option<String>,
) -> Result<(), String> {
    run(
        &app,
        "shareFile",
        ShareArgs {
            path,
            mime_type,
            title,
            text,
        },
    )
    .map(|_| ())
}

/// Abre WhatsApp (o WhatsApp Business) en el chat del número, con la imagen lista para enviar.
#[tauri::command]
async fn share_whatsapp<R: Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    phone: String,
    text: Option<String>,
    whatsapp: Option<String>,
) -> Result<(), String> {
    run(
        &app,
        "shareWhatsApp",
        DirectArgs {
            path,
            phone,
            text,
            app: whatsapp,
        },
    )
    .map(|_| ())
}

/// Abre el chat de WhatsApp de cualquier número con el texto escrito (sin imagen).
#[tauri::command]
async fn open_whatsapp_chat<R: Runtime>(
    app: tauri::AppHandle<R>,
    phone: String,
    text: Option<String>,
    whatsapp: Option<String>,
) -> Result<(), String> {
    run(
        &app,
        "openWhatsAppChat",
        ChatArgs {
            phone,
            text,
            app: whatsapp,
        },
    )
    .map(|_| ())
}

/// Abre la conversación del número en Mensajes; la imagen va adjunta o queda copiada para pegarla.
#[tauri::command]
async fn share_sms<R: Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    phone: String,
    text: Option<String>,
) -> Result<serde_json::Value, String> {
    run(
        &app,
        "shareSms",
        DirectArgs {
            path,
            phone,
            text,
            app: None,
        },
    )
}

/// Qué WhatsApp hay instalados: { whatsapp: bool, business: bool }.
#[tauri::command]
async fn whatsapp_apps<R: Runtime>(app: tauri::AppHandle<R>) -> Result<serde_json::Value, String> {
    run(&app, "whatsappApps", serde_json::json!({}))
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("compartir")
        .invoke_handler(tauri::generate_handler![
            share_file,
            share_whatsapp,
            open_whatsapp_chat,
            share_sms,
            whatsapp_apps
        ])
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    _api.register_android_plugin("pr.supermobile.compartir", "SharePlugin")?;
                _app.manage(Compartir(handle));
            }
            Ok(())
        })
        .build()
}
