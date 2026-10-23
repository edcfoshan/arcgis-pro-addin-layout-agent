use std::path::PathBuf;

#[test]
fn updater_and_process_permissions_are_granted() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let raw = std::fs::read_to_string(manifest.join("capabilities/default.json"))
        .expect("capabilities/default.json exists");
    let capability: serde_json::Value = serde_json::from_str(&raw).expect("valid capability json");

    let permissions = capability["permissions"]
        .as_array()
        .expect("permissions is an array");
    for required in ["updater:default", "process:default"] {
        assert!(
            permissions.iter().any(|item| item.as_str() == Some(required)),
            "missing permission: {required}"
        );
    }
}
