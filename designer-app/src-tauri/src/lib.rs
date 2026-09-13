use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use base64::Engine as _;
use serde::{Deserialize, Serialize};

const REPO_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");

fn icon_cache_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("ICON_CACHE_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    PathBuf::from(REPO_ROOT).join("tools/icon-cache")
}

fn validator_project_dir() -> PathBuf {
    PathBuf::from(REPO_ROOT).join("arcgis-pro-validation/GisProRibbonLayoutValidator.AddIn")
}

fn build_script() -> PathBuf {
    PathBuf::from(REPO_ROOT).join("tools/build-arcgis-pro-validation.ps1")
}

#[derive(Serialize)]
struct IconEntry {
    file: String,
    base: String,
    theme: String,
    px: u32,
}

fn split_trailing_size(stem: &str) -> (String, u32) {
    let digits = stem.chars().rev().take_while(|c| c.is_ascii_digit()).count();
    if digits == 0 {
        return (stem.to_string(), 0);
    }
    let px = stem[stem.len() - digits..].parse().unwrap_or(0);
    (stem[..stem.len() - digits].to_string(), px)
}

fn parse_icon_file(file: &str) -> Option<IconEntry> {
    let stem = file.strip_suffix(".png")?;
    let (theme, rest) = if let Some(rest) = stem.strip_prefix("darkimages_") {
        ("dark", rest)
    } else if let Some(rest) = stem.strip_prefix("images_") {
        ("light", rest)
    } else {
        ("other", stem)
    };
    let (base, px) = split_trailing_size(rest);
    Some(IconEntry {
        file: file.to_string(),
        base,
        theme: theme.to_string(),
        px,
    })
}

#[tauri::command]
fn list_icons() -> Result<Vec<IconEntry>, String> {
    let dir = icon_cache_dir();
    let mut icons = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("read_dir {}: {e}", dir.display()))?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".png") {
            if let Some(icon) = parse_icon_file(&name) {
                icons.push(icon);
            }
        }
    }
    icons.sort_by(|a, b| a.base.cmp(&b.base).then(a.px.cmp(&b.px)));
    Ok(icons)
}

#[derive(Serialize)]
struct IconResult {
    file: String,
    data_url: String,
}

fn valid_icon_name(file: &str) -> bool {
    !file.is_empty()
        && file.ends_with(".png")
        && !file.contains("..")
        && file
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
}

fn icon_data_url(dir: &Path, file: &str) -> Result<IconResult, String> {
    if !valid_icon_name(file) {
        return Err(format!("invalid icon file name: {file}"));
    }
    let bytes = fs::read(dir.join(file)).map_err(|e| format!("read icon {file}: {e}"))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(IconResult {
        file: file.to_string(),
        data_url: format!("data:image/png;base64,{b64}"),
    })
}

#[tauri::command]
fn search_icons(query: String, theme: String, limit: usize) -> Result<Vec<IconResult>, String> {
    let dir = icon_cache_dir();
    let all = list_icons()?;
    let q = query.to_lowercase();
    let want_theme = if theme.is_empty() { "light" } else { theme.as_str() };
    let cap = limit.clamp(1, 400);
    let mut out = Vec::new();
    for icon in &all {
        if icon.theme != want_theme {
            continue;
        }
        if !q.is_empty() && !icon.base.to_lowercase().contains(&q) {
            continue;
        }
        out.push(icon_data_url(&dir, &icon.file)?);
        if out.len() >= cap {
            break;
        }
    }
    Ok(out)
}

#[tauri::command]
fn get_icon_data_url(file: String) -> Result<IconResult, String> {
    icon_data_url(&icon_cache_dir(), &file)
}

#[tauri::command]
fn write_text_file(dir: String, filename: String, content: String) -> Result<String, String> {
    let is_safe_name = !filename.is_empty()
        && !filename.contains("..")
        && filename
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._- \\".contains(c));
    if !is_safe_name {
        return Err(format!("invalid filename: {filename}"));
    }
    let target_dir = PathBuf::from(&dir);
    if !target_dir.is_absolute() {
        return Err("dir must be an absolute path".into());
    }
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    let path = target_dir.join(&filename);
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[derive(Deserialize)]
pub struct ExportPayload {
    pub layout_snapshot: String,
    pub package_file_name: String,
    pub target_dir: String,
    pub version: String,
    pub icon_files: Vec<String>,
}

fn add_file_to_zip<W: Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    entry_name: &str,
    bytes: &[u8],
    options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
    zip.start_file(entry_name, options)
        .map_err(|e| format!("zip start_file {entry_name}: {e}"))?;
    zip.write_all(bytes).map_err(|e| e.to_string())
}

fn add_dir_to_zip<W: Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    dir: &Path,
    prefix: &str,
    options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
    let entries =
        fs::read_dir(dir).map_err(|e| format!("read_dir {}: {e}", dir.display()))?;
    for entry in entries.flatten() {
        let child_name = entry.file_name().to_string_lossy().to_string();
        let entry_path = entry.path();
        let entry_name = format!("{prefix}/{child_name}");
        if entry_path.is_dir() {
            add_dir_to_zip(zip, &entry_path, &entry_name, options)?;
        } else {
            let bytes = fs::read(&entry_path)
                .map_err(|e| format!("read {}: {e}", entry_path.display()))?;
            add_file_to_zip(zip, &entry_name, &bytes, options)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn export_addin(payload: ExportPayload) -> Result<String, String> {
    run_export_addin(payload)
}

pub fn run_export_addin(payload: ExportPayload) -> Result<String, String> {
    if !payload
        .package_file_name
        .to_lowercase()
        .ends_with(".esriaddinx")
    {
        return Err("package_file_name must end with .esriAddInX".into());
    }

    let project_dir = validator_project_dir();
    let layout_dir = project_dir.join("Layout");
    fs::create_dir_all(&layout_dir).map_err(|e| e.to_string())?;
    fs::write(
        layout_dir.join("current-layout.json"),
        &payload.layout_snapshot,
    )
    .map_err(|e| e.to_string())?;

    let status = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &build_script().to_string_lossy(),
            "-ProjectDir",
            &project_dir.to_string_lossy(),
            "-InputJson",
            &layout_dir.join("current-layout.json").to_string_lossy(),
            "-Version",
            &payload.version,
        ])
        .status()
        .map_err(|e| format!("failed to launch build script: {e}"))?;
    if !status.success() {
        return Err(format!("build script failed with status {status}"));
    }

    let staging = project_dir
        .join("obj")
        .join("Debug")
        .join("net8.0-windows7.0")
        .join("temp_archive");
    let install_dir = staging.join("Install");
    if !install_dir.is_dir() {
        return Err(format!("missing staging dir: {}", install_dir.display()));
    }

    let target_dir = PathBuf::from(&payload.target_dir);
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    let package_path = target_dir.join(&payload.package_file_name);
    let zip_file = fs::File::create(&package_path)
        .map_err(|e| format!("create package: {e}"))?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let options: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let config_bytes = fs::read(staging.join("Config.daml"))
        .or_else(|_| fs::read(project_dir.join("Config.daml")))
        .map_err(|e| format!("read Config.daml: {e}"))?;
    add_file_to_zip(&mut zip, "Config.daml", &config_bytes, options)?;
    add_dir_to_zip(&mut zip, &install_dir, "Install", options)?;

    let icon_dir = icon_cache_dir();
    for file in &payload.icon_files {
        if !valid_icon_name(file) {
            return Err(format!("invalid icon file name: {file}"));
        }
        let bytes = fs::read(icon_dir.join(file))
            .map_err(|e| format!("read icon {file}: {e}"))?;
        add_file_to_zip(&mut zip, &format!("Images/{file}"), &bytes, options)?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(package_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_icons,
            search_icons,
            get_icon_data_url,
            write_text_file,
            export_addin
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_light_dark_and_sizes() {
        let light = parse_icon_file("images_adddata32.png").unwrap();
        assert_eq!(light.theme, "light");
        assert_eq!(light.base, "adddata");
        assert_eq!(light.px, 32);

        let dark = parse_icon_file("darkimages_zoomtool16.png").unwrap();
        assert_eq!(dark.theme, "dark");
        assert_eq!(dark.base, "zoomtool");
        assert_eq!(dark.px, 16);

        assert!(parse_icon_file("readme.txt").is_none());
    }

    #[test]
    fn rejects_bad_icon_names() {
        assert!(!valid_icon_name("../evil.png"));
        assert!(!valid_icon_name("a/b.png"));
        assert!(valid_icon_name("images_adddata32.png"));
    }
}
