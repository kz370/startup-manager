import { invoke } from "@tauri-apps/api/core";

export interface AppEntry {
  Name: string;
  Process: string;
  Path: string;
  Args: string;
  Enabled: boolean;
  Delay: number;
  WindowStyle: string;
  Days: number[];
  ExceptionDates: string[];
}

export function getApps(): Promise<AppEntry[]> {
  return invoke<AppEntry[]>("get_apps");
}

export function saveApps(apps: AppEntry[]): Promise<void> {
  return invoke("save_apps", { apps });
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

export function toggleApp(index: number): Promise<AppEntry[]> {
  return invoke<AppEntry[]>("toggle_app", { index });
}

export function runApps(): Promise<string[]> {
  return invoke<string[]>("run_apps");
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

export function setSpecificAppsEnabled(indices: number[], enabled: boolean): Promise<AppEntry[]> {
  return invoke<AppEntry[]>("set_specific_apps_enabled", { indices, enabled });
}

export function getRunningStatus(): Promise<boolean[]> {
  return invoke<boolean[]>("get_running_status");
}
