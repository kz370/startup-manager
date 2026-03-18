use crate::apps::{get_log_path, AppEntry};
use chrono::Local;
use std::fs::OpenOptions;
use std::io::Write;
use std::process::Command;

fn log_message(msg: &str) {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let line = format!("[{}] {}\n", timestamp, msg);
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(get_log_path())
    {
        let _ = file.write_all(line.as_bytes());
    }
}

/// Helper to create a Command that hides the console window on Windows
fn silent_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

pub fn is_process_running(process_name: &str) -> bool {
    let output = silent_command("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {}", process_name), "/NH", "/FO", "CSV"])
        .output();
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout.to_lowercase().contains(&process_name.to_lowercase())
        }
        Err(_) => false,
    }
}

pub fn run_all_apps(apps: &[AppEntry]) -> Vec<String> {
    let mut results: Vec<String> = Vec::new();
    let today = Local::now();
    let today_weekday = today.format("%w").to_string().parse::<u8>().unwrap_or(0);
    let today_date = today.format("%Y-%m-%d").to_string();

    log_message("=== Startup Manager started ===");

    for app in apps {
        // Skip disabled
        if !app.enabled {
            let msg = format!("{}: skipped (disabled)", app.name);
            log_message(&msg);
            results.push(msg);
            continue;
        }

        // Check days
        if !app.days.is_empty() && !app.days.contains(&today_weekday) {
            let msg = format!("{}: skipped (not scheduled for today, day={})", app.name, today_weekday);
            log_message(&msg);
            results.push(msg);
            continue;
        }

        // Check exception dates
        if app.exception_dates.contains(&today_date) {
            let msg = format!("{}: skipped (exception date {})", app.name, today_date);
            log_message(&msg);
            results.push(msg);
            continue;
        }

        // Check if already running
        if is_process_running(&app.process) {
            let msg = format!("{}: skipped (already running)", app.name);
            log_message(&msg);
            results.push(msg);
            continue;
        }

        // Check path exists
        let path = std::path::Path::new(&app.path);
        if !path.exists() {
            let msg = format!("{}: skipped (path missing: {})", app.name, app.path);
            log_message(&msg);
            results.push(msg);
            continue;
        }

        // Apply delay
        if app.delay > 0 {
            std::thread::sleep(std::time::Duration::from_millis(app.delay));
        }

        // Build command
        let mut cmd = Command::new(&app.path);

        // Add args if not empty
        if !app.args.trim().is_empty() {
            for arg in app.args.split_whitespace() {
                cmd.arg(arg);
            }
        }

        // Window style via CREATE_FLAGS on Windows
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            match app.window_style.to_lowercase().as_str() {
                "minimized" => {
                    cmd.creation_flags(0x00000200); // CREATE_NEW_PROCESS_GROUP
                }
                "hidden" => {
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }
                "maximized" => {
                    cmd.creation_flags(0x00000200);
                }
                _ => {} // Normal
            }
        }

        match cmd.spawn() {
            Ok(_) => {
                let msg = format!("{}: started successfully", app.name);
                log_message(&msg);
                results.push(msg);
            }
            Err(e) => {
                let msg = format!("{}: error ({})", app.name, e);
                log_message(&msg);
                results.push(msg);
            }
        }
    }

    log_message("=== Startup Manager finished ===");
    results
}

pub fn stop_all_apps(apps: &[AppEntry]) -> Vec<String> {
    let mut results: Vec<String> = Vec::new();

    log_message("=== Stopping all apps ===");

    for app in apps {
        if app.process.is_empty() {
            continue;
        }

        if !is_process_running(&app.process) {
            let msg = format!("{}: not running", app.name);
            log_message(&msg);
            results.push(msg);
            continue;
        }

        let output = silent_command("taskkill")
            .args(["/IM", &app.process, "/F"])
            .output();

        match output {
            Ok(out) => {
                if out.status.success() {
                    let msg = format!("{}: stopped", app.name);
                    log_message(&msg);
                    results.push(msg);
                } else {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    let msg = format!("{}: stop failed ({})", app.name, stderr.trim());
                    log_message(&msg);
                    results.push(msg);
                }
            }
            Err(e) => {
                let msg = format!("{}: stop error ({})", app.name, e);
                log_message(&msg);
                results.push(msg);
            }
        }
    }

    log_message("=== Stop all finished ===");
    results
}
