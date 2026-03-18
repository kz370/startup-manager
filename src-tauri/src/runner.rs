use crate::apps::AppEntry;
use std::collections::HashSet;
use std::path::Path;
use std::process::Command;

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

pub fn effective_process_name(app: &AppEntry) -> String {
    let p = app.process.trim();
    if !p.is_empty() {
        return p.to_string();
    }
    Path::new(&app.path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

/// Lowercased image names currently running (single tasklist call).
fn running_image_names_lower() -> HashSet<String> {
    let output = silent_command("tasklist")
        .args(["/FO", "CSV", "/NH"])
        .output();
    let Ok(out) = output else {
        return HashSet::new();
    };
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut set = HashSet::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // "image.exe","1234",...
        let Some(rest) = line.strip_prefix('"') else {
            continue;
        };
        let Some(end) = rest.find("\",\"") else {
            continue;
        };
        let name = &rest[..end];
        if !name.is_empty() {
            set.insert(name.to_lowercase());
        }
    }
    set
}

pub fn running_status_for_apps(apps: &[AppEntry]) -> Vec<bool> {
    let running = running_image_names_lower();
    apps
        .iter()
        .map(|app| {
            let proc = effective_process_name(app);
            let p = proc.trim().to_lowercase();
            !p.is_empty() && running.contains(&p)
        })
        .collect()
}

pub fn run_entries(apps: &[AppEntry]) -> Vec<String> {
    let mut running = running_image_names_lower();
    let mut results = Vec::new();

    for app in apps {
        let proc = effective_process_name(app);
        let proc_lower = proc.trim().to_lowercase();

        if !proc_lower.is_empty() && running.contains(&proc_lower) {
            results.push(format!("{}: already running", app.name));
            continue;
        }

        let path = Path::new(&app.path);
        if !path.exists() {
            results.push(format!("{}: path missing ({})", app.name, app.path));
            continue;
        }

        let mut cmd = Command::new(&app.path);
        if !app.args.trim().is_empty() {
            for arg in app.args.split_whitespace() {
                cmd.arg(arg);
            }
        }

        match cmd.spawn() {
            Ok(_) => {
                results.push(format!("{}: started", app.name));
                if !proc_lower.is_empty() {
                    running.insert(proc_lower);
                }
            }
            Err(e) => results.push(format!("{}: error ({})", app.name, e)),
        }
    }

    results
}

pub fn stop_entries(apps: &[AppEntry]) -> Vec<String> {
    let mut running = running_image_names_lower();
    let mut results = Vec::new();

    for app in apps {
        let proc = effective_process_name(app);
        if proc.trim().is_empty() {
            results.push(format!("{}: no executable name (set path or process name)", app.name));
            continue;
        }

        let key = proc.trim().to_lowercase();
        if !running.contains(&key) {
            results.push(format!("{}: not running", app.name));
            continue;
        }

        let output = silent_command("taskkill")
            .args(["/IM", &proc, "/F"])
            .output();

        match output {
            Ok(out) => {
                if out.status.success() {
                    running.remove(&key);
                    results.push(format!("{}: stopped", app.name));
                } else {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    results.push(format!("{}: stop failed ({})", app.name, stderr.trim()));
                }
            }
            Err(e) => results.push(format!("{}: stop error ({})", app.name, e)),
        }
    }

    results
}
