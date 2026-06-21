// Adivari desktop shell (Tauri v2).
//
// Responsibilities:
//  1. Start the local agent bridge daemon (`adivari daemon`) so Claude Code
//     hooks / the CLI wrapper have something to talk to.
//  2. Host the earner ad surface (configured in tauri.conf.json).
//  3. Provide a tray icon to show status and quit.
//
// The webview loads the same earner UI as the web app, which connects to the
// bridge over Server-Sent Events and plays ads while the agent is busy.

use std::process::Command;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

fn start_bridge() {
    // Best effort: if the `adivari` CLI is installed (npm i -g @adivari/agent),
    // launch the local bridge. Failure is non-fatal — the user can run it
    // manually with `adivari daemon`.
    match Command::new("adivari").arg("daemon").spawn() {
        Ok(_) => println!("adivari: bridge daemon started"),
        Err(e) => eprintln!("adivari: could not start bridge ({e}); run `adivari daemon` manually"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            start_bridge();

            let show = MenuItem::with_id(app, "show", "Show Adivari", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let mut tray = TrayIconBuilder::new()
                .tooltip("Adivari — earn while your agent works")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Adivari desktop");
}
