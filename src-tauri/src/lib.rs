use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Directories the host bridge is allowed to touch. Everything else is
/// rejected. The webview never loads remote content, so the practical
/// attack surface is ~nil, but a path allowlist keeps the pattern honest:
/// arbitrary JS in the webview still cannot read or clobber files outside
/// the user's own home or the scratch dir, even though the ISO user has
/// NOPASSWD:ALL.
fn allowed_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home));
    }
    roots.push(PathBuf::from("/tmp"));
    roots
}

/// Resolve `path` and confirm it sits inside one of the allowed roots.
///
/// For an existing target we canonicalize it directly (which also resolves
/// symlinks, defeating symlink escapes). For a not-yet-existing write
/// target we canonicalize its nearest existing ancestor and re-append the
/// remaining components, so `..` in the tail can't climb out either.
fn resolve_allowed(path: &str) -> Result<PathBuf, String> {
    let requested = Path::new(path);

    let canonical = if requested.exists() {
        requested
            .canonicalize()
            .map_err(|e| format!("cannot resolve {path}: {e}"))?
    } else {
        // Walk up to the first existing ancestor, canonicalize it, then
        // re-attach the trailing (non-existent) components verbatim after
        // rejecting any `..` in that tail.
        let mut existing = requested;
        let mut tail: Vec<&std::ffi::OsStr> = Vec::new();
        loop {
            if existing.exists() {
                break;
            }
            match existing.file_name() {
                Some(name) => {
                    tail.push(name);
                    existing = existing.parent().unwrap_or(Path::new("/"));
                }
                None => return Err(format!("invalid path: {path}")),
            }
        }
        let mut base = existing
            .canonicalize()
            .map_err(|e| format!("cannot resolve parent of {path}: {e}"))?;
        for comp in tail.iter().rev() {
            if *comp == std::ffi::OsStr::new("..") {
                return Err(format!("path traversal rejected: {path}"));
            }
            base.push(comp);
        }
        base
    };

    let roots = allowed_roots();
    if roots.iter().any(|root| canonical.starts_with(root)) {
        Ok(canonical)
    } else {
        Err(format!(
            "access denied: {path} is outside the allowed roots {:?}",
            roots
        ))
    }
}

#[derive(Serialize)]
struct HostInfo {
    os: &'static str,
    arch: &'static str,
    family: &'static str,
    hostname: String,
    cwd: String,
    epoch_ms: u128,
    tauri_version: &'static str,
    allowed_roots: Vec<String>,
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
        allowed_roots: allowed_roots()
            .iter()
            .map(|p| p.display().to_string())
            .collect(),
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
    let resolved = resolve_allowed(&path)?;
    let content = fs::read_to_string(&resolved).map_err(|e| format!("{e}"))?;
    let bytes = content.len();
    Ok(HostReadResult {
        path: resolved.display().to_string(),
        content,
        bytes,
    })
}

#[tauri::command]
fn host_write_file(path: String, content: String) -> Result<usize, String> {
    let resolved = resolve_allowed(&path)?;
    if let Some(parent) = resolved.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("{e}"))?;
        }
    }
    let bytes = content.len();
    fs::write(&resolved, content).map_err(|e| format!("{e}"))?;
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
    let resolved = resolve_allowed(&path)?;
    let entries = fs::read_dir(&resolved).map_err(|e| format!("{e}"))?;
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
