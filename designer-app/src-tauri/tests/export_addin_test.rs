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
