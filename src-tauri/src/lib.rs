mod apps;
mod runner;

use tauri::Manager;
use apps::{load_apps, save_apps_to_file, AppEntry};
use runner::{run_entries, running_status_for_apps, stop_entries};
#[tauri::command]
fn get_apps() -> Result<Vec<AppEntry>, String> {
    load_apps()
}

#[tauri::command]
fn add_app(app: AppEntry) -> Result<Vec<AppEntry>, String> {
    let mut apps = load_apps()?;
    apps.push(app);
    save_apps_to_file(&apps)?;
    Ok(apps)
}

#[tauri::command]
fn remove_app(index: usize) -> Result<Vec<AppEntry>, String> {
    let mut apps = load_apps()?;
    if index >= apps.len() {
        return Err("Index out of bounds".to_string());
    }
    apps.remove(index);
    save_apps_to_file(&apps)?;
    Ok(apps)
}

#[tauri::command]
fn update_app(index: usize, app: AppEntry) -> Result<Vec<AppEntry>, String> {
    let mut apps = load_apps()?;
    if index >= apps.len() {
        return Err("Index out of bounds".to_string());
    }
    apps[index] = app;
    save_apps_to_file(&apps)?;
    Ok(apps)
}

#[tauri::command]
fn run_all_apps() -> Result<Vec<String>, String> {
    let apps = load_apps()?;
    Ok(run_entries(&apps))
}

#[tauri::command]
fn run_specific_apps(indices: Vec<usize>) -> Result<Vec<String>, String> {
    let apps = load_apps()?;
    let specific: Vec<AppEntry> = apps
        .into_iter()
        .enumerate()
        .filter(|(i, _)| indices.contains(i))
        .map(|(_, a)| a)
        .collect();
    Ok(run_entries(&specific))
}

#[tauri::command]
fn stop_specific_apps(indices: Vec<usize>) -> Result<Vec<String>, String> {
    let apps = load_apps()?;
    let specific: Vec<AppEntry> = apps
        .into_iter()
        .enumerate()
        .filter(|(i, _)| indices.contains(i))
        .map(|(_, a)| a)
        .collect();
    Ok(stop_entries(&specific))
}

#[tauri::command]
fn delete_specific_apps(mut indices: Vec<usize>) -> Result<Vec<AppEntry>, String> {
    let mut apps = load_apps()?;
    indices.sort_unstable_by(|a, b| b.cmp(a));
    for index in indices {
        if index < apps.len() {
            apps.remove(index);
        }
    }
    save_apps_to_file(&apps)?;
    Ok(apps)
}

#[tauri::command]
fn get_running_status() -> Result<Vec<bool>, String> {
    let apps = load_apps()?;
    Ok(running_status_for_apps(&apps))
}

/// Writes the current app list to a JSON file (e.g. for backup or transfer).
#[tauri::command]
fn export_settings(path: String) -> Result<(), String> {
    let apps = load_apps()?;
    let content = serde_json::to_string_pretty(&apps)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

/// Replaces the app list from a JSON file and persists it to the default location.
#[tauri::command]
fn import_settings(path: String) -> Result<Vec<AppEntry>, String> {
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let apps: Vec<AppEntry> = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid settings file (expected app list JSON): {}", e))?;
    save_apps_to_file(&apps)?;
    Ok(apps)
}

#[cfg(desktop)]
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show = MenuItem::with_id(app, "show", "Show App Launcher", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit completely", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false);

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    let _tray = builder
        .tooltip("App Launcher — click to show, or use the menu")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_single_instance::init(
        |app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        },
    ));

    #[cfg(not(desktop))]
    let mut builder = tauri::Builder::default();

    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                setup_tray(app)?;
            }
            Ok(())
        });

    #[cfg(desktop)]
    {
        builder = builder.on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        });
    }

    builder
        .invoke_handler(tauri::generate_handler![
            get_apps,
            add_app,
            remove_app,
            update_app,
            run_all_apps,
            run_specific_apps,
            stop_specific_apps,
            delete_specific_apps,
            get_running_status,
            export_settings,
            import_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
