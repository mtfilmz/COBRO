# Cobro · Super Mobile Tech Repair

Programa de facturación para **Ventas, Servicios y Reparaciones**. Funciona **sin internet**: todos los datos se guardan en la computadora.

Versión de prueba 0.1.0.

## Qué trae

- Entrada con PIN: un **administrador** (supermobilepr@gmail.com) y empleados con su propio PIN.
- **Inicio del administrador:** facturado, cobrado, por cobrar, totales por tipo y botón **Ocultar montos**.
- **Inicio del empleado:** sin balance ni totales. Accesos rápidos, equipos en el taller y facturas recientes.
- **Nueva factura:** Venta, Servicio o Reparación. En reparaciones: equipo, "IMEI, número de serie o modelo", hasta 3 fotos, falla, accesorios, garantía y estado del equipo. Numeración automática (VEN-00001, SER-00001, REP-00001).
- **Detalle de factura:** hoja blanca para el cliente, impresión o PDF ("Microsoft Print to PDF"), WhatsApp y Mensaje directos al número de "Enviar a" con la imagen JPG (en Windows, Mensaje usa Enlace Móvil), pagos parciales, estado del equipo, fotos y actividad. Las facturas no se borran, se anulan con motivo.
- **Clientes, Catálogo y Reportes** (los reportes son solo para el administrador).
- **5 temas globales:** Claro, Oscuro, Negro, Azul marino y Automático. La factura del cliente siempre sale en blanco.
- **Importar historial de Factura:** respaldo `.json` o CSV. Conserva los números originales, sugiere el tipo de cada factura y el lote se puede revertir.
- **Respaldo:** descarga o recupera todo en `.json`. Como programa de Windows, guarda además un respaldo automático diario en `Documentos\Cobro\Respaldos`.

## Probarlo ya, sin instalar nada

Abre `app/index.html` con Edge o Chrome. Funciona sin internet.

Lo que hagas así se guarda en el navegador, separado del programa .exe. Para pasarlo al .exe usa **Ajustes › Datos y respaldo**.

## Crear el instalador `Cobro-Setup.exe` con GitHub (gratis)

1. Entra a github.com y crea un repositorio nuevo, por ejemplo `cobro` (puede ser privado).
2. Sube **todo el contenido** de esta carpeta, incluida la carpeta `.github`. Puedes usar "Add file › Upload files" y arrastrar todo.
3. GitHub empieza solo a armar el programa. Míralo en la pestaña **Actions** ("Crear instalador de Windows"). Tarda unos 10 a 15 minutos la primera vez.
4. Cuando termine con ✓, abre esa ejecución y descarga **Cobro-Setup** en "Artifacts". Es un .zip que trae el instalador `.exe`.
5. Ejecuta el instalador. La primera vez Windows puede mostrar **"Windows protegió su PC"** porque el programa no tiene firma comercial: toca **Más información › Ejecutar de todas formas**.

Para publicar una versión con su propio enlace de descarga, crea una etiqueta `v0.1.0` en GitHub. El instalador queda adjunto en **Releases**.

Si un paso falla, abre la ejecución en **Actions**, copia el mensaje de error y compártelo para corregirlo.

## Dónde quedan los datos

- **Programa de Windows:** en la carpeta de datos del usuario de Windows (`%LOCALAPPDATA%\pr.supermobile.cobro`). Los respaldos y exportaciones van a `Documentos\Cobro`.
- Si olvidas el PIN del administrador: en la pantalla de entrada usa **¿Olvidaste el PIN del administrador?** con el código de recuperación que se mostró al configurar. Puedes crear uno nuevo en **Ajustes › Usuarios**.

## Copia en la nube

- **Ajustes › Nube:** Cobro entra con la cuenta de Game Fix (correo y contraseña; la contraseña no se guarda) y sube una copia de clientes, facturas, pagos, catálogo, fotos, lotes, ajustes del negocio y numeración a la tabla `cobro_records` de la base de datos de Game Fix (Supabase `tbkptuvpzwvdjqmsbmeh`). Cobro y Game Fix comparten esa base. Hasta la 0.6.x la copia estaba en la base de Factura; al actualizar, Cobro cierra esa sesión y pide entrar con Game Fix.
- Cada fila es de un solo usuario (seguridad por fila). Gana el cambio más reciente; la numeración siempre toma el mayor.
- Sin internet, los cambios esperan en cola y se suben solos. Los tokens de la sesión se guardan en `nube.json`, en la carpeta de datos de la app, fuera de los respaldos.
- En otra computadora: instalar Cobro, crear el administrador y conectar la nube. No volver a importar el historial de Factura allí.
- Los pagos que bajan de la nube no se envían a FinTrack; cada pago lo envía la computadora donde se cobró.

## Android

- El mismo código genera el APK (`Cobro_<versión>_android.apk` en Releases), firmado con la llave del secreto `ANDROID_KEYSTORE`. Todas las versiones deben firmarse con esa misma llave para poder actualizar encima.
- Instalar: descargar el APK en el teléfono, abrirlo y permitir "Instalar apps desconocidas" para el navegador o Archivos.
- La factura se guarda como PDF (Guardar PDF); desde Archivos se imprime o se comparte. Los respaldos se guardan con la ventana de Android.
- Al entrar el administrador, la app revisa `android.json` del último release y avisa si hay versión nueva.
- Los datos viven en el teléfono; la copia de seguridad es la nube (Ajustes › Nube).

## Estructura

```
app/            La aplicación (HTML, CSS y JavaScript sin dependencias)
  js/store.js   Base de datos local (IndexedDB) y reglas del negocio
  js/import.js  Importación del historial de Factura
  js/views/     Pantallas
src-tauri/      Envoltura de Windows (Tauri 2)
.github/        Proceso que arma el .exe en GitHub
```

## Clientes con Game Fix (0.8.0)

Cobro y Game Fix comparten la misma base de datos (Supabase de Game Fix) y la misma cuenta. Con la nube conectada (Ajustes › Nube), Cobro lee los clientes de Game Fix (`clients`) y el contacto de sus reparaciones (`repairs`: solo `id, cliente, telefono, email`), y guarda en `clients` los clientes de Cobro con `source_key = 'cobro:<id>'` (índice único: no se duplican). Solo completa campos vacíos; nunca borra ni pisa. El programa limita las rutas permitidas en `ruta_nube_permitida` (lib.rs). Hasta la 0.7.x se usaba un código y una clave privada (`tech-repair-clients`); al actualizar se borra esa clave del equipo.
