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

// 导入包提取的图标落盘目录(独立于 vendored 主缓存,避免污染 git);ICON_IMPORT_DIR 可覆盖
fn icon_import_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("ICON_IMPORT_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    PathBuf::from(REPO_ROOT).join("tools/icon-cache-import")
}

// 图标查找目录:导入目录优先于主缓存
fn icon_search_dirs() -> [PathBuf; 2] {
    [icon_import_dir(), icon_cache_dir()]
}

fn validator_project_dir() -> PathBuf {
    PathBuf::from(REPO_ROOT).join("arcgis-pro-validation/GisProRibbonLayoutValidator.AddIn")
}

fn build_script() -> PathBuf {
    PathBuf::from(REPO_ROOT).join("tools/build-arcgis-pro-validation.ps1")
}

fn default_target_dir() -> PathBuf {
    validator_project_dir().join("bin/Debug/net8.0-windows7.0")
}

// 默认导出目录随 REPO_ROOT 编译期定位,避免写死机器路径;前端首启或发现旧机器路径时来取
#[tauri::command]
fn get_default_target_dir() -> Result<String, String> {
    Ok(default_target_dir().to_string_lossy().to_string())
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
    let mut icons = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for dir in icon_search_dirs() {
        if !dir.is_dir() {
            continue; // 导入目录可能尚不存在
        }
        let entries =
            fs::read_dir(&dir).map_err(|e| format!("read_dir {}: {e}", dir.display()))?;
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".png") && seen.insert(name.clone()) {
                if let Some(icon) = parse_icon_file(&name) {
                    icons.push(icon);
                }
            }
        }
    }
    icons.sort_by(|a, b| a.base.cmp(&b.base).then(a.px.cmp(&b.px)));
    Ok(icons)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")] // Tauri 只对入参做 camelCase 转换,返回值需手动 rename 才能匹配前端 hit.dataUrl
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

// 双目录读图标:导入目录优先,主缓存兜底
fn read_icon_bytes(file: &str) -> Result<Vec<u8>, String> {
    for dir in icon_search_dirs() {
        if let Ok(bytes) = fs::read(dir.join(file)) {
            return Ok(bytes);
        }
    }
    Err(format!("read icon {file}: not found in icon directories"))
}

fn icon_data_url(file: &str) -> Result<IconResult, String> {
    if !valid_icon_name(file) {
        return Err(format!("invalid icon file name: {file}"));
    }
    let bytes = read_icon_bytes(file)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(IconResult {
        file: file.to_string(),
        data_url: format!("data:image/png;base64,{b64}"),
    })
}

#[tauri::command]
fn search_icons(query: String, theme: String, limit: usize) -> Result<Vec<IconResult>, String> {
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
        out.push(icon_data_url(&icon.file)?);
        if out.len() >= cap {
            break;
        }
    }
    Ok(out)
}

#[tauri::command]
fn get_icon_data_url(file: String) -> Result<IconResult, String> {
    icon_data_url(&file)
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

    for file in &payload.icon_files {
        if !valid_icon_name(file) {
            return Err(format!("invalid icon file name: {file}"));
        }
        let bytes = read_icon_bytes(file)?;
        add_file_to_zip(&mut zip, &format!("Images/{file}"), &bytes, options)?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(package_path.to_string_lossy().to_string())
}

// ===== 第三方 add-in 导入:解包取 DAML 文本与图标,布局解析在前端 core/damlImport =====

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedIcon {
    pub daml_name: String, // DAML 引用的原始基名(如 addpoint16.png)
    pub file: String,      // 落盘后的文件名(与主缓存撞名时带 imp_ 前缀)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedPackage {
    pub kind: String, // "esriaddinx" | "daml" | "json"
    pub package_name: String,
    pub daml_text: String,
    pub json_text: String,
    pub icons: Vec<ImportedIcon>,
}

// 剥 BOM;UTF-16 按 lossy 转;其余按 UTF-8 lossy——第三方 DAML 编码不可控,宁乱码不崩溃
fn decode_text_bytes(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(&bytes[3..]).into_owned();
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    String::from_utf8_lossy(bytes).into_owned()
}

// zip 内文件名只保留白名单字符的基名,平铺落盘(免疫路径穿越)
fn sanitize_icon_file_name(name: &str) -> String {
    let base: String = name
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or("")
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if base.is_empty() {
        "imported_icon.png".to_string()
    } else if base.to_lowercase().ends_with(".png") {
        base
    } else {
        format!("{base}.png")
    }
}

// 选导入图标落盘名:导入目录已有同字节文件则幂等跳过;与导入目录或主缓存撞名一律加 imp_ 前缀
fn pick_import_icon_name(
    import_dir: &Path,
    main_dir: &Path,
    base: &str,
    bytes: &[u8],
) -> Option<(String, bool)> {
    for attempt in 0..100 {
        let candidate = match attempt {
            0 => base.to_string(),
            1 => format!("imp_{base}"),
            n => format!("imp{}_{base}", n - 1),
        };
        let path = import_dir.join(&candidate);
        if path.is_file() {
            if fs::read(&path).map(|old| old == bytes).unwrap_or(false) {
                return Some((candidate, true));
            }
            continue;
        }
        if main_dir.join(&candidate).is_file() {
            continue;
        }
        return Some((candidate, false));
    }
    None
}

pub fn run_open_import_file(path: &str) -> Result<ImportedPackage, String> {
    let file_path = PathBuf::from(path);
    if !file_path.is_file() {
        return Err(format!("文件不存在: {path}"));
    }
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    let package_name = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("导入的 Add-In")
        .to_string();

    if ext == "json" {
        let text = fs::read_to_string(&file_path).map_err(|e| format!("读取失败: {e}"))?;
        return Ok(ImportedPackage {
            kind: "json".into(),
            package_name,
            daml_text: String::new(),
            json_text: text,
            icons: Vec::new(),
        });
    }
    if ext == "daml" {
        let bytes = fs::read(&file_path).map_err(|e| format!("读取失败: {e}"))?;
        return Ok(ImportedPackage {
            kind: "daml".into(),
            package_name,
            daml_text: decode_text_bytes(&bytes),
            json_text: String::new(),
            icons: Vec::new(),
        });
    }
    if ext != "esriaddinx" {
        return Err("不支持的文件类型(支持 .esriAddInX / .daml / .json)".into());
    }

    // .esriAddInX = zip:定位 Config.daml(大小写不敏感)+ 提取全部 .png(不限 Images/ 前缀,
    // CC工具箱等真实包的图标在 Data/Images/)
    let file = fs::File::open(&file_path).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|_| format!("不是有效的 esriAddInX 安装包(zip): {path}"))?;

    let mut daml_text = String::new();
    let mut icons: Vec<ImportedIcon> = Vec::new();
    let import_dir = icon_import_dir();
    let main_dir = icon_cache_dir();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("读取 zip 条目失败: {e}"))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        let base_name = name.replace('\\', "/");
        let base_name = base_name.rsplit('/').next().unwrap_or("").to_string();
        if base_name.eq_ignore_ascii_case("config.daml") && daml_text.is_empty() {
            let mut bytes = Vec::new();
            std::io::Read::read_to_end(&mut entry, &mut bytes)
                .map_err(|e| format!("读取 Config.daml 失败: {e}"))?;
            daml_text = decode_text_bytes(&bytes);
            continue;
        }
        if name.to_lowercase().ends_with(".png")
            && icons.len() < 1500
            && entry.size() <= 8 * 1024 * 1024
        {
            let mut bytes = Vec::new();
            std::io::Read::read_to_end(&mut entry, &mut bytes)
                .map_err(|e| format!("读取图标 {name} 失败: {e}"))?;
            let sanitized = sanitize_icon_file_name(&name);
            if let Some((file_name, skip_write)) =
                pick_import_icon_name(&import_dir, &main_dir, &sanitized, &bytes)
            {
                if !skip_write {
                    fs::create_dir_all(&import_dir).map_err(|e| e.to_string())?;
                    fs::write(import_dir.join(&file_name), &bytes).map_err(|e| e.to_string())?;
                }
                icons.push(ImportedIcon {
                    daml_name: sanitized,
                    file: file_name,
                });
            }
        }
    }
    if daml_text.is_empty() {
        return Err("包内未找到 Config.daml".into());
    }
    Ok(ImportedPackage {
        kind: "esriaddinx".into(),
        package_name,
        daml_text,
        json_text: String::new(),
        icons,
    })
}

#[tauri::command]
fn open_import_file(path: String) -> Result<ImportedPackage, String> {
    run_open_import_file(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_icons,
            search_icons,
            get_icon_data_url,
            write_text_file,
            get_default_target_dir,
            export_addin,
            open_import_file
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

    #[test]
    fn sanitizes_icon_names() {
        assert_eq!(sanitize_icon_file_name("Images/add point.png"), "add_point.png");
        assert_eq!(sanitize_icon_file_name("Data/Images/x.PNG"), "x.PNG");
        assert_eq!(sanitize_icon_file_name("../evil\\x.png"), "x.png");
        assert_eq!(sanitize_icon_file_name(""), "imported_icon.png");
    }

    #[test]
    fn picks_import_icon_names() {
        let tmp = std::env::temp_dir().join("designer-icon-pick-test");
        let _ = fs::remove_dir_all(&tmp);
        let main = tmp.join("main");
        let import = tmp.join("import");
        fs::create_dir_all(&main).unwrap();
        fs::create_dir_all(&import).unwrap();

        // 新名:直接落盘
        let (name, skip) = pick_import_icon_name(&import, &main, "fresh.png", b"a").unwrap();
        assert_eq!((name.as_str(), skip), ("fresh.png", false));
        fs::write(import.join("fresh.png"), b"a").unwrap();
        // 同字节:幂等跳过
        let (name, skip) = pick_import_icon_name(&import, &main, "fresh.png", b"a").unwrap();
        assert_eq!((name.as_str(), skip), ("fresh.png", true));
        // 撞主缓存名:加 imp_ 前缀
        fs::write(main.join("cached.png"), b"z").unwrap();
        let (name, skip) = pick_import_icon_name(&import, &main, "cached.png", b"a").unwrap();
        assert_eq!((name.as_str(), skip), ("imp_cached.png", false));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn decodes_text_with_bom_and_utf16() {
        assert_eq!(decode_text_bytes(&[0xEF, 0xBB, 0xBF, b'a']), "a");
        assert_eq!(
            decode_text_bytes(&[0xFF, 0xFE, 0x2D, 0x4E]), // UTF-16LE「中」
            "\u{4e2d}"
        );
        assert_eq!(decode_text_bytes(b"plain"), "plain");
    }
}
