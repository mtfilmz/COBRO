//! Abre el menú Compartir del teléfono (Android) con un archivo guardado en la carpeta temporal de la app.
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

#[cfg(target_os = "android")]
struct Compartir<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[tauri::command]
async fn share_file<R: Runtime>(
    app: tauri::AppHandle<R>,
    path: String,
    mime_type: String,
    title: Option<String>,
    text: Option<String>,
) -> Result<(), String> {
    let args = ShareArgs {
        path,
        mime_type,
        title,
        text,
    };
    #[cfg(target_os = "android")]
    {
        let handle = app.state::<Compartir<R>>();
        handle
            .0
            .run_mobile_plugin::<serde_json::Value>("shareFile", args)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, args);
        Err("Compartir solo está disponible en Android.".into())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("compartir")
        .invoke_handler(tauri::generate_handler![share_file])
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
