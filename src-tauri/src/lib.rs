use std::fs;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![guardar_archivo])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Cobro");
}
