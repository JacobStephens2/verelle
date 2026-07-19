use std::{fs, path::PathBuf};
use verelle_core::{ExpectedChart, GoldenFixture, build_charts};

#[test]
fn every_fixture_matches_its_expected_chart_structure() {
    let fixture_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures");
    let mut paths: Vec<_> = fs::read_dir(&fixture_dir)
        .expect("fixtures directory")
        .map(|entry| entry.expect("fixture entry").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .collect();
    paths.sort();
    assert!(!paths.is_empty(), "golden suite must never be empty");

    for path in paths {
        let fixture: GoldenFixture =
            serde_json::from_str(&fs::read_to_string(&path).expect("read fixture"))
                .unwrap_or_else(|error| panic!("parse {}: {error}", path.display()));
        let actual: Vec<ExpectedChart> = build_charts(&fixture.observations)
            .into_iter()
            .map(ExpectedChart::from)
            .collect();
        assert_eq!(actual, fixture.expected, "fixture: {}", fixture.name);
    }
}
