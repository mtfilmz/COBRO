use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

/// Guarda un archivo (respaldo o exportación) en Documentos\Cobro\<carpeta>\<nombre>
/// y devuelve la ruta completa para mostrarla en la app.
#[tauri::command]
fn guardar_archivo(
    app: tauri::AppHandle,
    carpeta: String,
    nombre: String,
    contenido: String,
) -> Result<String, String> {
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
    if !b.starts_with("https://")
        || b.len() > 300
        || b.contains('?')
        || b.contains('#')
        || b.contains(' ')
    {
        return Err("La dirección de FinTrack del código no es válida.".into());
    }
    Ok(b)
}

async fn enviar(
    url: String,
    cuerpo: String,
    clave: String,
    apikey: Option<String>,
    idempotencia: Option<String>,
) -> Result<Respuesta, String> {
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
async fn fintrack_vincular(
    app: tauri::AppHandle,
    base: String,
    apikey: Option<String>,
    cuerpo: String,
) -> Result<Respuesta, String> {
    let base = validar_base(&base)?;
    let mut datos = leer_fintrack(&app);
    let clave = datos
        .clave
        .clone()
        .ok_or("Primero guarda la clave de conexión.")?;
    let r = enviar(
        format!("{base}/finance-link"),
        cuerpo,
        clave,
        apikey.clone(),
        None,
    )
    .await?;
    if r.status == 200 {
        datos.base = Some(base);
        datos.apikey = apikey;
        guardar_fintrack(&app, &datos)?;
    }
    Ok(r)
}

#[tauri::command]
async fn fintrack_enviar_pago(
    app: tauri::AppHandle,
    cuerpo: String,
    idempotencia: String,
) -> Result<Respuesta, String> {
    let datos = leer_fintrack(&app);
    let clave = datos
        .clave
        .ok_or("Falta la clave de conexión con FinTrack.")?;
    let base = datos.base.ok_or("Cobro no está conectado a FinTrack.")?;
    enviar(
        format!("{base}/receive-repair-payment"),
        cuerpo,
        clave,
        datos.apikey,
        Some(idempotencia),
    )
    .await
}

/* ---------- Copia en la nube (base de datos de Factura) ----------
Cobro entra con la misma cuenta de Factura. La contraseña nunca se guarda: solo los
tokens de la sesión, aquí en la carpeta de datos de la app (fuera de los respaldos).
Todas las llamadas a la nube salen desde este lado y solo a la tabla cobro_records. */

#[derive(Serialize, Deserialize, Default)]
struct NubeLocal {
    base: Option<String>,
    apikey: Option<String>,
    email: Option<String>,
    user_id: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    expira: Option<i64>,
}

#[derive(Serialize)]
struct EstadoNube {
    conectado: bool,
    email: Option<String>,
    user_id: Option<String>,
}

#[derive(Serialize)]
struct CuentaNube {
    email: String,
    user_id: String,
}

fn candado_nube() -> &'static tokio::sync::Mutex<()> {
    static CANDADO: std::sync::OnceLock<tokio::sync::Mutex<()>> = std::sync::OnceLock::new();
    CANDADO.get_or_init(|| tokio::sync::Mutex::new(()))
}

fn ahora() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn ruta_nube(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("nube.json"))
}

fn leer_nube(app: &tauri::AppHandle) -> NubeLocal {
    ruta_nube(app)
        .ok()
        .and_then(|r| fs::read_to_string(r).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn guardar_nube(app: &tauri::AppHandle, datos: &NubeLocal) -> Result<(), String> {
    let ruta = ruta_nube(app)?;
    let texto = serde_json::to_string(datos).map_err(|e| e.to_string())?;
    fs::write(ruta, texto).map_err(|e| format!("No se pudo guardar la sesión de la nube: {e}"))
}

fn cliente_nube() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())
}

fn validar_https(base: &str) -> Result<String, String> {
    let b = base.trim().trim_end_matches('/').to_string();
    if !b.starts_with("https://")
        || b.len() > 300
        || b.contains('?')
        || b.contains('#')
        || b.contains(' ')
    {
        return Err("La dirección de la nube no es válida.".into());
    }
    Ok(b)
}

async fn pedir_token(
    cli: &reqwest::Client,
    base: &str,
    apikey: &str,
    grant: &str,
    cuerpo: Value,
) -> Result<(u16, Value), String> {
    let r = cli
        .post(format!("{base}/auth/v1/token?grant_type={grant}"))
        .header("apikey", apikey)
        .header("Content-Type", "application/json")
        .body(cuerpo.to_string())
        .send()
        .await
        .map_err(|e| format!("No se pudo llegar a la nube: {e}"))?;
    let status = r.status().as_u16();
    let texto = r.text().await.unwrap_or_default();
    Ok((status, serde_json::from_str(&texto).unwrap_or(Value::Null)))
}

fn aplicar_sesion(d: &mut NubeLocal, v: &Value) -> bool {
    let acceso = v.get("access_token").and_then(|x| x.as_str());
    let renovar = v.get("refresh_token").and_then(|x| x.as_str());
    if let (Some(a), Some(r)) = (acceso, renovar) {
        d.access_token = Some(a.to_string());
        d.refresh_token = Some(r.to_string());
        let dura = v.get("expires_in").and_then(|x| x.as_i64()).unwrap_or(3600);
        d.expira = Some(ahora() + dura);
        if let Some(u) = v.get("user") {
            if let Some(id) = u.get("id").and_then(|x| x.as_str()) {
                d.user_id = Some(id.to_string());
            }
            if let Some(e) = u.get("email").and_then(|x| x.as_str()) {
                d.email = Some(e.to_string());
            }
        }
        return d.user_id.is_some();
    }
    false
}

fn mensaje_login(v: &Value) -> String {
    let texto = [
        "error_description",
        "msg",
        "message",
        "error_code",
        "code",
        "error",
    ]
    .iter()
    .filter_map(|k| v.get(*k).and_then(|x| x.as_str()))
    .collect::<Vec<_>>()
    .join(" ")
    .to_lowercase();
    if texto.contains("not confirmed") {
        "Tu correo todavía no está confirmado en Factura.".into()
    } else if texto.contains("invalid") || texto.contains("credentials") {
        "Correo o contraseña incorrectos. Usa los mismos con los que entras a Factura.".into()
    } else {
        "No se pudo iniciar sesión en la nube.".into()
    }
}

#[tauri::command]
fn nube_estado(app: tauri::AppHandle) -> EstadoNube {
    let d = leer_nube(&app);
    EstadoNube {
        conectado: d.base.is_some() && d.refresh_token.is_some(),
        email: d.email,
        user_id: d.user_id,
    }
}

#[tauri::command]
async fn nube_conectar(
    app: tauri::AppHandle,
    bases: Vec<String>,
    apikey: String,
    email: String,
    password: String,
) -> Result<CuentaNube, String> {
    let _guardia = candado_nube().lock().await;
    let email = email.trim().to_string();
    if email.is_empty() || !email.contains('@') || email.len() > 200 {
        return Err("Escribe el correo con el que entras a Factura.".into());
    }
    if password.is_empty() || password.len() > 500 {
        return Err("Escribe la contraseña de Factura.".into());
    }
    if apikey.is_empty() || apikey.len() > 300 || !apikey.chars().all(|c| c.is_ascii_graphic()) {
        return Err("Falta la clave pública de la nube.".into());
    }
    let cli = cliente_nube()?;
    let mut ultimo = String::from("No se pudo llegar a la nube. Revisa el internet.");
    for b in bases.iter().take(4) {
        let base = match validar_https(b) {
            Ok(x) => x,
            Err(e) => {
                ultimo = e;
                continue;
            }
        };
        let resultado = pedir_token(
            &cli,
            &base,
            &apikey,
            "password",
            json!({ "email": email, "password": password }),
        )
        .await;
        let (status, v) = match resultado {
            Ok(x) => x,
            Err(e) => {
                ultimo = e;
                continue;
            }
        };
        if status == 200 {
            let mut d = NubeLocal {
                base: Some(base),
                apikey: Some(apikey.clone()),
                ..Default::default()
            };
            if !aplicar_sesion(&mut d, &v) {
                return Err("La nube respondió algo inesperado al iniciar sesión.".into());
            }
            guardar_nube(&app, &d)?;
            return Ok(CuentaNube {
                email: d.email.clone().unwrap_or(email),
                user_id: d.user_id.clone().unwrap_or_default(),
            });
        }
        if status == 400 || status == 401 || status == 422 {
            return Err(mensaje_login(&v));
        }
        if status == 429 {
            return Err("Demasiados intentos. Espera unos minutos y vuelve a intentar.".into());
        }
        ultimo = format!("La nube respondió con un error ({status}).");
    }
    Err(ultimo)
}

#[tauri::command]
async fn nube_desconectar(app: tauri::AppHandle) -> Result<(), String> {
    let _guardia = candado_nube().lock().await;
    let d = leer_nube(&app);
    if let (Some(base), Some(apikey), Some(token)) = (d.base, d.apikey, d.access_token) {
        if let Ok(cli) = cliente_nube() {
            let _ = cli
                .post(format!("{base}/auth/v1/logout"))
                .header("apikey", apikey)
                .header("Authorization", format!("Bearer {token}"))
                .send()
                .await;
        }
    }
    let ruta = ruta_nube(&app)?;
    if ruta.exists() {
        fs::remove_file(ruta).map_err(|e| format!("No se pudo cerrar la sesión: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
async fn nube_pedir(
    app: tauri::AppHandle,
    metodo: String,
    ruta: String,
    cuerpo: Option<String>,
    prefer: Option<String>,
) -> Result<Respuesta, String> {
    if !ruta.starts_with("/rest/v1/cobro_records") || ruta.contains("..") || ruta.len() > 2000 {
        return Err("Ruta no permitida.".into());
    }
    let metodo = match metodo.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PATCH" => reqwest::Method::PATCH,
        _ => return Err("Método no permitido.".into()),
    };
    let _guardia = candado_nube().lock().await;
    let mut d = leer_nube(&app);
    let (base, apikey) = match (d.base.clone(), d.apikey.clone()) {
        (Some(b), Some(k)) => (b, k),
        _ => {
            return Ok(Respuesta {
                status: 401,
                body: "{\"error\":\"sin_sesion\"}".into(),
            });
        }
    };
    let cli = cliente_nube()?;
    if d.access_token.is_none() || d.expira.unwrap_or(0) - 120 <= ahora() {
        let renovar = match d.refresh_token.clone() {
            Some(r) => r,
            None => {
                return Ok(Respuesta {
                    status: 401,
                    body: "{\"error\":\"sin_sesion\"}".into(),
                });
            }
        };
        let (status, v) = pedir_token(
            &cli,
            &base,
            &apikey,
            "refresh_token",
            json!({ "refresh_token": renovar }),
        )
        .await?;
        if status == 200 && aplicar_sesion(&mut d, &v) {
            guardar_nube(&app, &d)?;
        } else if status == 400 || status == 401 || status == 403 {
            d.access_token = None;
            d.refresh_token = None;
            guardar_nube(&app, &d)?;
            return Ok(Respuesta {
                status: 401,
                body: "{\"error\":\"sesion_vencida\"}".into(),
            });
        } else {
            return Ok(Respuesta {
                status,
                body: v.to_string(),
            });
        }
    }
    let token = d.access_token.clone().unwrap_or_default();
    let mut solicitud = cli
        .request(metodo, format!("{base}{ruta}"))
        .header("apikey", apikey)
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json");
    if let Some(p) = prefer {
        solicitud = solicitud.header("Prefer", p);
    }
    if let Some(c) = cuerpo {
        solicitud = solicitud.body(c);
    }
    let r = solicitud
        .send()
        .await
        .map_err(|e| format!("No se pudo llegar a la nube: {e}"))?;
    let status = r.status().as_u16();
    let body = r.text().await.unwrap_or_default();
    Ok(Respuesta { status, body })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Actualizaciones firmadas desde GitHub Releases; la app pide autorización antes de instalar.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            guardar_archivo,
            fintrack_estado,
            fintrack_guardar_clave,
            fintrack_olvidar,
            fintrack_vincular,
            fintrack_enviar_pago,
            nube_estado,
            nube_conectar,
            nube_desconectar,
            nube_pedir
        ])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Cobro");
}
