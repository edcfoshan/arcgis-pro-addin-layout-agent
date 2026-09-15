use std::fs;
use std::path::PathBuf;

// 用真实 demo 包验证导入链路:解包 DAML + 提取图标落盘(demo 图标与主缓存撞名应全部加 imp_ 前缀)
#[test]
fn import_demo_package_extracts_daml_and_icons() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let tmp_root = repo.join("designer-app/src-tauri/target/tmp-import-test");
    let _ = fs::remove_dir_all(&tmp_root);
    std::env::set_var("ICON_IMPORT_DIR", tmp_root.join("icons"));

    let package = repo.join("00测试包/AllControls-Demo-1.0.1.esriAddInX");
    assert!(
        package.is_file(),
        "先运行 build_all_controls_demo_package 生成演示包"
    );

    let imported = designer_app_lib::run_open_import_file(package.to_string_lossy().as_ref())
        .expect("import demo package should succeed");
    assert_eq!(imported.kind, "esriaddinx");
    assert!(imported.daml_text.contains("<tab "));
    assert!(imported.daml_text.contains("refID="));
    assert!(imported.daml_text.contains("<controls>"));
    assert_eq!(imported.icons.len(), 42, "demo 包应提取 42 张图标");
    let icons_dir = tmp_root.join("icons");
    for icon in &imported.icons {
        assert!(
            icon.file.starts_with("imp_"),
            "demo 图标与主缓存撞名应加 imp_ 前缀: {}",
            icon.file
        );
        let path = icons_dir.join(&icon.file);
        assert!(path.is_file(), "图标应落盘: {}", path.display());
    }

    let _ = fs::remove_dir_all(&tmp_root);
}

// 损坏包(全零)应优雅报错而非 panic(真实场景:AlailaiPro 包即此类损坏)
#[test]
fn import_corrupt_package_reports_error() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let corrupt = repo.join("designer-app/src-tauri/target/tmp-import-corrupt.esriAddInX");
    fs::create_dir_all(corrupt.parent().unwrap()).unwrap();
    fs::write(&corrupt, vec![0u8; 1024]).unwrap();
    let result = designer_app_lib::run_open_import_file(corrupt.to_string_lossy().as_ref());
    let err = result.err().expect("corrupt zip should fail");
    assert!(err.contains("不是有效的"), "unexpected error: {err}");
    let _ = fs::remove_file(&corrupt);
}
