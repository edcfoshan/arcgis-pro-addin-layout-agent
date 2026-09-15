use std::fs;
use std::path::PathBuf;

fn import_dirs(repo: &std::path::Path) -> designer_app_lib::ImportDirs {
    designer_app_lib::ImportDirs {
        import_dir: repo.join("designer-app/src-tauri/target/tmp-import-test/icons"),
        main_zip: repo.join("designer-app/src-tauri/icons-tabler.zip"),
    }
}

// 用真实 demo 包验证导入链路:解包 DAML + 提取图标落盘(demo 为 Esri 名,与 Tabler 主缓存不撞,应落原名)
#[test]
fn import_demo_package_extracts_daml_and_icons() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let tmp_root = repo.join("designer-app/src-tauri/target/tmp-import-test");
    let _ = fs::remove_dir_all(&tmp_root);

    let package = repo.join("00测试包/AllControls-Demo-1.0.1.esriAddInX");
    if !package.is_file() {
        // demo 包由开发侧管线生成(dotnet 链),CI/干净环境跳过
        eprintln!("跳过:未找到演示包 {}", package.display());
        return;
    }

    let imported = designer_app_lib::run_open_import_file(
        package.to_string_lossy().as_ref(),
        &import_dirs(&repo),
    )
    .expect("import demo package should succeed");
    assert_eq!(imported.kind, "esriaddinx");
    assert!(imported.daml_text.contains("<tab "));
    assert!(imported.daml_text.contains("refID="));
    assert!(imported.daml_text.contains("<controls>"));
    assert!(imported.icons.len() > 0, "demo 包应提取出图标");
    let icons_dir = tmp_root.join("icons");
    for icon in &imported.icons {
        assert!(
            icon.file == icon.daml_name,
            "Esri 图标名与 Tabler 主缓存不撞,应落原名: {} -> {}",
            icon.daml_name,
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
    let result = designer_app_lib::run_open_import_file(
        corrupt.to_string_lossy().as_ref(),
        &import_dirs(&repo),
    );
    let err = result.err().expect("corrupt zip should fail");
    assert!(err.contains("不是有效的"), "unexpected error: {err}");
    let _ = fs::remove_file(&corrupt);
}
