use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppEntry {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "Process")]
    pub process: String,
    #[serde(rename = "Path")]
    pub path: String,
    #[serde(rename = "Args")]
    #[serde(default)]
    pub args: String,
    #[serde(rename = "Enabled")]
    pub enabled: bool,
    #[serde(rename = "Delay")]
    #[serde(default)]
    pub delay: u64,
    #[serde(rename = "WindowStyle")]
    #[serde(default = "default_window_style")]
    pub window_style: String,
    #[serde(rename = "Days")]
    #[serde(default)]
    pub days: Vec<u8>,
    #[serde(rename = "ExceptionDates")]
    #[serde(default)]
    pub exception_dates: Vec<String>,
}

fn default_window_style() -> String {
    "Normal".to_string()
}

/// Get the app data directory: %APPDATA%/startup-manager/
fn get_app_data_dir() -> PathBuf {
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            // Fallback to exe directory if APPDATA is not set
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_else(|| PathBuf::from("."))
        });
    let dir = base.join("startup-manager");
    // Ensure directory exists
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn get_apps_file_path() -> PathBuf {
    get_app_data_dir().join("apps.json")
}

pub fn get_log_path() -> PathBuf {
    get_app_data_dir().join("startup_log.txt")
}

pub fn load_apps() -> Result<Vec<AppEntry>, String> {
    let path = get_apps_file_path();
    if !path.exists() {
        // Create empty file
        fs::write(&path, "[]").map_err(|e| format!("Failed to create apps.json: {}", e))?;
        return Ok(vec![]);
    }
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read apps.json: {}", e))?;
    let apps: Vec<AppEntry> =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse apps.json: {}", e))?;
    Ok(apps)
}

pub fn save_apps_to_file(apps: &[AppEntry]) -> Result<(), String> {
    let path = get_apps_file_path();
    let content = serde_json::to_string_pretty(apps)
        .map_err(|e| format!("Failed to serialize apps: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write apps.json: {}", e))?;
    Ok(())
}
