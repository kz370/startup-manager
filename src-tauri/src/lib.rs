mod apps;
mod runner;

use apps::{load_apps, save_apps_to_file, AppEntry};
use runner::{run_all_apps, stop_all_apps, is_process_running};

#[tauri::command]
fn get_apps() -> Result<Vec<AppEntry>, String> {
    load_apps()
}

#[tauri::command]
fn save_apps(apps: Vec<AppEntry>) -> Result<(), String> {
    save_apps_to_file(&apps)
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
fn toggle_app(index: usize) -> Result<Vec<AppEntry>, String> {
    let mut apps = load_apps()?;
    if index >= apps.len() {
        return Err("Index out of bounds".to_string());
    }
    apps[index].enabled = !apps[index].enabled;
    save_apps_to_file(&apps)?;
    Ok(apps)
}

#[tauri::command]
fn run_apps() -> Result<Vec<String>, String> {
    let apps = load_apps()?;
    let results = run_all_apps(&apps);
    Ok(results)
}

#[tauri::command]
fn run_specific_apps(indices: Vec<usize>) -> Result<Vec<String>, String> {
    let apps = load_apps()?;
    let specific_apps: Vec<AppEntry> = apps
        .into_iter()
        .enumerate()
        .filter(|(i, _)| indices.contains(i))
        .map(|(_, a)| a)
        .collect();
    Ok(run_all_apps(&specific_apps))
}

#[tauri::command]
fn stop_specific_apps(indices: Vec<usize>) -> Result<Vec<String>, String> {
    let apps = load_apps()?;
    let specific_apps: Vec<AppEntry> = apps
        .into_iter()
        .enumerate()
        .filter(|(i, _)| indices.contains(i))
        .map(|(_, a)| a)
        .collect();
    Ok(stop_all_apps(&specific_apps))
}

#[tauri::command]
fn delete_specific_apps(mut indices: Vec<usize>) -> Result<Vec<AppEntry>, String> {
    let mut apps = load_apps()?;
    indices.sort_unstable_by(|a, b| b.cmp(a)); // sort descending
    for index in indices {
        if index < apps.len() {
            apps.remove(index);
        }
    }
    save_apps_to_file(&apps)?;
    Ok(apps)
}

#[tauri::command]
fn set_specific_apps_enabled(indices: Vec<usize>, enabled: bool) -> Result<Vec<AppEntry>, String> {
    let mut apps = load_apps()?;
    for index in indices {
        if index < apps.len() {
            apps[index].enabled = enabled;
        }
    }
    save_apps_to_file(&apps)?;
    Ok(apps)
}

#[tauri::command]
fn get_running_status() -> Result<Vec<bool>, String> {
    let apps = load_apps()?;
    let statuses: Vec<bool> = apps
        .iter()
        .map(|app| {
            if app.process.is_empty() {
                false
            } else {
                is_process_running(&app.process)
            }
        })
        .collect();
    Ok(statuses)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_apps,
            save_apps,
            add_app,
            remove_app,
            update_app,
            toggle_app,
            run_apps,
            run_specific_apps,
            stop_specific_apps,
            delete_specific_apps,
            set_specific_apps_enabled,
            get_running_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
