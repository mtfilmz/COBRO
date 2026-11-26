const COMMANDS: &[&str] = &["share_file", "share_whatsapp", "open_whatsapp_chat", "share_sms", "whatsapp_apps"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
