import { invoke } from "@tauri-apps/api/core";

export interface AppEntry {
  Name: string;
  Path: string;
  /** Empty = use file name from Path */
  Process: string;
  Args: string;
}

export function getApps(): Promise<AppEntry[]> {
  return invoke<AppEntry[]>("get_apps");
}

export function addApp(app: AppEntry): Promise<AppEntry[]> {
  return invoke<AppEntry[]>("add_app", { app });
}

export function removeApp(index: number): Promise<AppEntry[]> {
  return invoke<AppEntry[]>("remove_app", { index });
}

export function updateApp(index: number, app: AppEntry): Promise<AppEntry[]> {
  return invoke<AppEntry[]>("update_app", { index, app });
}

export function runAllApps(): Promise<string[]> {
  return invoke<string[]>("run_all_apps");
}

export function runSpecificApps(indices: number[]): Promise<string[]> {
  return invoke<string[]>("run_specific_apps", { indices });
}

export function stopSpecificApps(indices: number[]): Promise<string[]> {
  return invoke<string[]>("stop_specific_apps", { indices });
}

export function deleteSpecificApps(indices: number[]): Promise<AppEntry[]> {
  return invoke<AppEntry[]>("delete_specific_apps", { indices });
}

export function getRunningStatus(): Promise<boolean[]> {
  return invoke<boolean[]>("get_running_status");
}

export function exportSettings(path: string): Promise<void> {
  return invoke("export_settings", { path });
}

export function importSettings(path: string): Promise<AppEntry[]> {
  return invoke<AppEntry[]>("import_settings", { path });
}
