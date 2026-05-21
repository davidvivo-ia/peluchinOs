use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
struct HostInfo {
    os: &'static str,
    arch: &'static str,
    family: &'static str,
    hostname: String,
    cwd: String,
    epoch_ms: u128,
    tauri_version: &'static str,
}

#[tauri::command]
fn host_info() -> HostInfo {
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "peluchinos".into());
    let cwd = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "/".into());
    let epoch_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    HostInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        family: std::env::consts::FAMILY,
        hostname,
        cwd,
        epoch_ms,
        tauri_version: tauri::VERSION,
    }
}

#[derive(Serialize)]
struct HostReadResult {
    path: String,
    content: String,
    bytes: usize,
}

#[tauri::command]
fn host_read_file(path: String) -> Result<HostReadResult, String> {
    let p = Path::new(&path);
    let content = fs::read_to_string(p).map_err(|e| format!("{e}"))?;
    let bytes = content.len();
    Ok(HostReadResult {
        path,
        content,
        bytes,
    })
}

#[tauri::command]
fn host_write_file(path: String, content: String) -> Result<usize, String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("{e}"))?;
        }
    }
    let bytes = content.len();
    fs::write(p, content).map_err(|e| format!("{e}"))?;
    Ok(bytes)
}

#[derive(Serialize)]
struct HostListEntry {
    name: String,
    is_dir: bool,
    size: u64,
}

#[tauri::command]
fn host_list_dir(path: String) -> Result<Vec<HostListEntry>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("{e}"))?;
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let meta = entry.metadata().map_err(|e| format!("{e}"))?;
        out.push(HostListEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size: meta.len(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            host_info,
            host_read_file,
            host_write_file,
            host_list_dir,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running peluchinOs");
}
