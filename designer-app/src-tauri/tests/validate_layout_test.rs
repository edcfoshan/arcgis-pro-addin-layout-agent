use std::fs;
use std::path::PathBuf;

// 组装 CaseDir 单测:拷贝安装包 + 写入 Config.daml / layout.json(不触 Pro)
#[test]
fn assemble_case_dir_copies_artifacts() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let tmp = repo.join("designer-app/src-tauri/target/tmp-validate-test");
    let case_dir = tmp.join("case-01");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&case_dir).unwrap();

    let package = tmp.join("fake.esriAddInX");
    fs::write(&package, b"placeholder package").unwrap();

    designer_app_lib::assemble_case_dir(
        &case_dir,
        &package,
        "<ConfigDaml>ok</ConfigDaml>",
        r#"{"tabs":[]}"#,
    )
    .unwrap();

    assert!(case_dir.join("fake.esriAddInX").is_file());
    assert_eq!(
        fs::read_to_string(case_dir.join("Config.daml")).unwrap(),
        "<ConfigDaml>ok</ConfigDaml>"
    );
    assert_eq!(
        fs::read_to_string(case_dir.join("layout.json")).unwrap(),
        r#"{"tabs":[]}"#
    );

    let _ = fs::remove_dir_all(&tmp);
}

// 失败路径:CaseDir 不存在时脚本应非零退出,错误信息包含脚本输出
#[test]
fn run_pro_check_reports_script_error() {
    let missing =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/definitely-missing-case-xyz");
    let err = designer_app_lib::run_pro_check(&missing, 1)
        .err()
        .expect("pro check should fail on missing case dir");
    assert!(err.contains("pro-ui-check failed"), "unexpected error: {err}");
}

// 端到端(会真实调 dotnet 编译并启动/复用 ArcGIS Pro 截图),默认忽略,手动触发:
//   cargo test --test validate_layout_test -- --ignored --nocapture
#[test]
#[ignore]
fn e2e_validate_layout_full_chain() {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let snapshot = fs::read_to_string(
        repo.join("arcgis-pro-validation/GisProRibbonLayoutValidator.AddIn/Layout/current-layout.json"),
    )
    .unwrap();
    let payload = designer_app_lib::ValidationPayload {
        export: designer_app_lib::ExportPayload {
            layout_snapshot: snapshot,
            package_file_name: "E2E-Validate.esriAddInX".into(),
            target_dir: repo
                .join("designer-app/src-tauri/target/tmp-e2e-validate")
                .to_string_lossy()
                .to_string(),
            version: "1.0.1".into(),
            icon_files: vec![],
        },
        config_daml: "<ConfigDaml/>".into(),
        wait_seconds: Some(120),
    };
    let outcome =
        designer_app_lib::run_validate_layout(payload).expect("e2e validation should succeed");
    assert!(outcome.screenshot_data_url.starts_with("data:image/png;base64,"));
    // 浅色简洁的 Pro 窗口截图 PNG 约 50-60KB(base64 后 ~75KB),阈值留足余量
    assert!(
        outcome.screenshot_data_url.len() > 20_000,
        "screenshot too small: {}",
        outcome.screenshot_data_url.len()
    );
    println!("case_dir = {}", outcome.case_dir);
    println!("package  = {}", outcome.package_path);
    println!("report   = {}", outcome.report_json);
}
