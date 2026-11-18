use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

/// Guarda un archivo (respaldo o exportación) en Documentos\Cobro\<carpeta>\<nombre>
/// y devuelve la ruta completa para mostrarla en la app.
#[tauri::command]
fn guardar_archivo(app: tauri::AppHandle, carpeta: String, nombre: String, contenido: String) -> Result<String, String> {
    let limpiar = |s: &str| -> String {
        s.chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
            .collect()
    };
    let carpeta = limpiar(&carpeta);
    let nombre = limpiar(&nombre);
    if carpeta.is_empty() || nombre.is_empty() || nombre.starts_with('.') {
        return Err("Nombre de archivo no válido.".into());
    }
    let base = app.path().document_dir().map_err(|e| e.to_string())?;
    let dir = base.join("Cobro").join(carpeta);
    fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
    let ruta = dir.join(nombre);
    fs::write(&ruta, contenido).map_err(|e| format!("No se pudo guardar el archivo: {e}"))?;
    Ok(ruta.to_string_lossy().to_string())
}

/* ---------- Conexión con FinTrack ----------
   La clave de conexión y la dirección de FinTrack se guardan aquí, en la carpeta de datos
   de la app, y nunca pasan a la parte web. Los envíos salen desde este lado (Rust). */

#[derive(Serialize, Deserialize, Default)]
struct FinTrackLocal {
    clave: Option<String>,
    base: Option<String>,
    apikey: Option<String>,
}

#[derive(Serialize)]
struct EstadoFinTrack {
    tiene_clave: bool,
    conectado: bool,
}

#[derive(Serialize)]
struct Respuesta {
    status: u16,
    body: String,
}

fn ruta_fintrack(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("fintrack.json"))
}

fn leer_fintrack(app: &tauri::AppHandle) -> FinTrackLocal {
    ruta_fintrack(app)
        .ok()
        .and_then(|r| fs::read_to_string(r).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn guardar_fintrack(app: &tauri::AppHandle, datos: &FinTrackLocal) -> Result<(), String> {
    let ruta = ruta_fintrack(app)?;
    let texto = serde_json::to_string(datos).map_err(|e| e.to_string())?;
    fs::write(ruta, texto).map_err(|e| format!("No se pudo guardar la conexión: {e}"))
}

fn validar_base(base: &str) -> Result<String, String> {
    let b = base.trim().trim_end_matches('/').to_string();
    if !b.starts_with("https://") || b.len() > 300 || b.contains('?') || b.contains('#') || b.contains(' ') {
        return Err("La dirección de FinTrack del código no es válida.".into());
    }
    Ok(b)
}

async fn enviar(url: String, cuerpo: String, clave: String, apikey: Option<String>, idempotencia: Option<String>) -> Result<Respuesta, String> {
    let cliente = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let mut solicitud = cliente
        .post(url)
        .header("Content-Type", "application/json")
        .header("X-Integration-Secret", clave)
        .body(cuerpo);
    if let Some(k) = apikey {
        if !k.is_empty() {
            solicitud = solicitud.header("apikey", k);
        }
    }
    if let Some(i) = idempotencia {
        solicitud = solicitud.header("Idempotency-Key", i);
    }
    let respuesta = solicitud
        .send()
        .await
        .map_err(|e| format!("No se pudo llegar a FinTrack: {e}"))?;
    let status = respuesta.status().as_u16();
    let body = respuesta.text().await.unwrap_or_default();
    Ok(Respuesta { status, body })
}

#[tauri::command]
fn fintrack_estado(app: tauri::AppHandle) -> EstadoFinTrack {
    let datos = leer_fintrack(&app);
    EstadoFinTrack {
        tiene_clave: datos.clave.is_some(),
        conectado: datos.base.is_some(),
    }
}

#[tauri::command]
fn fintrack_guardar_clave(app: tauri::AppHandle, clave: String) -> Result<(), String> {
    let clave = clave.trim().to_string();
    if clave.len() < 32 || clave.len() > 256 || !clave.chars().all(|c| c.is_ascii_graphic()) {
        return Err("La clave debe tener entre 32 y 256 caracteres, sin espacios.".into());
    }
    let mut datos = leer_fintrack(&app);
    datos.clave = Some(clave);
    guardar_fintrack(&app, &datos)
}

#[tauri::command]
fn fintrack_olvidar(app: tauri::AppHandle) -> Result<(), String> {
    let mut datos = leer_fintrack(&app);
    datos.base = None;
    datos.apikey = None;
    guardar_fintrack(&app, &datos)
}

#[tauri::command]
async fn fintrack_vincular(app: tauri::AppHandle, base: String, apikey: Option<String>, cuerpo: String) -> Result<Respuesta, String> {
    let base = validar_base(&base)?;
    let mut datos = leer_fintrack(&app);
    let clave = datos.clave.clone().ok_or("Primero guarda la clave de conexión.")?;
    let r = enviar(format!("{base}/finance-link"), cuerpo, clave, apikey.clone(), None).await?;
    if r.status == 200 {
        datos.base = Some(base);
        datos.apikey = apikey;
        guardar_fintrack(&app, &datos)?;
    }
    Ok(r)
}

#[tauri::command]
async fn fintrack_enviar_pago(app: tauri::AppHandle, cuerpo: String, idempotencia: String) -> Result<Respuesta, String> {
    let datos = leer_fintrack(&app);
    let clave = datos.clave.ok_or("Falta la clave de conexión con FinTrack.")?;
    let base = datos.base.ok_or("Cobro no está conectado a FinTrack.")?;
    enviar(format!("{base}/receive-repair-payment"), cuerpo, clave, datos.apikey, Some(idempotencia)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Actualizaciones firmadas desde GitHub Releases; la app pide autorización antes de instalar.
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            guardar_archivo,
            fintrack_estado,
            fintrack_guardar_clave,
            fintrack_olvidar,
            fintrack_vincular,
            fintrack_enviar_pago
        ])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Cobro");
}
