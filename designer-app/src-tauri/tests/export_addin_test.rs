use std::path::PathBuf;

use designer_app_lib::ExportPayload;

#[test]
fn export_addin_builds_package() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let layout = std::fs::read_to_string(
        repo.join("arcgis-pro-validation/GisProRibbonLayoutValidator.AddIn/Layout/current-layout.json"),
    )
    .expect("sample layout json");

    let out_dir = repo
        .join("designer-app/src-tauri/target/tmp-export-test");
    let payload = ExportPayload {
        layout_snapshot: layout,
        package_file_name: "GisProRibbonLayoutValidator.AddIn-1.0.0-test.esriAddInX".into(),
        target_dir: out_dir.to_string_lossy().to_string(),
        version: "1.0.0".into(),
        icon_files: vec![],
        daml: None,
    };

    let result = designer_app_lib::run_export_addin(payload);
    let package_path = result.expect("export_addin should succeed");
    let meta = std::fs::metadata(&package_path).expect("package file exists");
    assert!(meta.len() > 10_000, "package too small: {}", meta.len());

    let file = std::fs::File::open(&package_path).unwrap();
    let mut zip = zip::ZipArchive::new(file).unwrap();
    let names: Vec<String> = (0..zip.len())
        .map(|i| zip.by_index(i).unwrap().name().to_string())
        .collect();
    assert!(names.iter().any(|n| n == "Config.daml"), "entries: {names:?}");
    assert!(
        names.iter().any(|n| n.starts_with("Install/") && n.ends_with(".dll")),
        "entries: {names:?}"
    );

    let _ = std::fs::remove_file(&package_path);
}

// 全控件演示包(9 种类型 × 各尺寸,21 控件,21 对图标):默认忽略,手动触发:
//   cargo test --test export_addin_test build_all_controls_demo_package -- --ignored --nocapture
// 前置:先跑 node --experimental-strip-types tools/generate-all-controls-demo.mts 生成布局 JSON
#[test]
#[ignore]
fn build_all_controls_demo_package() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let layout_path = repo.join("00测试包/all-controls-layout.json");
    let layout_snapshot = std::fs::read_to_string(&layout_path)
        .unwrap_or_else(|e| panic!("先运行 tools/generate-all-controls-demo.mts 生成布局: {e}"));

    // 从布局 JSON 收集全部 .png 图标名(去重),作为 icon_files 清单注入包内 Images/
    let layout: serde_json::Value = serde_json::from_str(&layout_snapshot).unwrap();
    let mut icon_files: Vec<String> = Vec::new();
    if let Some(controls) = layout["controls"].as_array() {
        for control in controls {
            for key in ["small", "large"] {
                if let Some(name) = control["icon"][key].as_str() {
                    if name.ends_with(".png") && !icon_files.iter().any(|item| item == name) {
                        icon_files.push(name.to_string());
                    }
                }
            }
        }
    }
    assert_eq!(icon_files.len(), 42, "预期 21 对(42 个)图标文件");

    let out_dir = repo.join("00测试包");
    std::fs::create_dir_all(&out_dir).unwrap();
    let package_path = out_dir.join("AllControls-Demo-1.0.1.esriAddInX");
    let _ = std::fs::remove_file(&package_path);

    let payload = ExportPayload {
        layout_snapshot,
        package_file_name: "AllControls-Demo-1.0.1.esriAddInX".into(),
        target_dir: out_dir.to_string_lossy().to_string(),
        version: "1.0.1".into(),
        icon_files,
        daml: None,
    };
    let result = designer_app_lib::run_export_addin(payload).expect("demo package build should succeed");

    let meta = std::fs::metadata(&result).unwrap();
    assert!(meta.len() > 10_000, "package too small: {}", meta.len());
    println!("demo package = {result}");
}
