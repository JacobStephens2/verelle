use anyhow::{Context, Result, bail};
use clap::{Parser, Subcommand, ValueEnum};
use std::{
    fs,
    path::{Path, PathBuf},
};
use verelle_core::{
    ExpectedChart, GoldenFixture, build_charts, observations_to_csv, observations_to_json,
};
use verelle_store::Store;

#[derive(Debug, Parser)]
#[command(name = "verelle", about = "Verelle chart-core harness")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Replay a golden fixture and print its instructor-readable chart data.
    Chart { fixture: PathBuf },
    /// Verify every JSON fixture in a directory.
    ValidateFixtures {
        #[arg(default_value = "fixtures")]
        directory: PathBuf,
    },
    /// Export the observations from a fixture without interpreting them.
    ExportFixture {
        fixture: PathBuf,
        #[arg(value_enum)]
        format: Format,
    },
    /// Export the materialized observations in a local Verelle `SQLite` file.
    ExportStore {
        database: PathBuf,
        #[arg(value_enum)]
        format: Format,
    },
    /// Render the materialized observations in a local Verelle `SQLite` file.
    ChartStore { database: PathBuf },
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum Format {
    Json,
    Csv,
}

fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Chart { fixture } => {
            let fixture = load_fixture(&fixture)?;
            let charts = build_charts(&fixture.observations);
            println!("{}", serde_json::to_string_pretty(&charts)?);
        }
        Command::ValidateFixtures { directory } => validate_fixtures(&directory)?,
        Command::ExportFixture { fixture, format } => {
            let fixture = load_fixture(&fixture)?;
            print_export(&fixture.observations, format)?;
        }
        Command::ExportStore { database, format } => {
            let store = open_existing_store(&database)?;
            match format {
                Format::Json => println!("{}", store.export_json()?),
                Format::Csv => print!("{}", store.export_csv()?),
            }
        }
        Command::ChartStore { database } => {
            let store = open_existing_store(&database)?;
            let charts = build_charts(&store.materialized_observations()?);
            println!("{}", serde_json::to_string_pretty(&charts)?);
        }
    }
    Ok(())
}

fn load_fixture(path: &Path) -> Result<GoldenFixture> {
    let fixture: GoldenFixture = serde_json::from_str(
        &fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?,
    )
    .with_context(|| format!("parse {}", path.display()))?;
    for observation in &fixture.observations {
        observation
            .validate()
            .with_context(|| format!("validate {}", path.display()))?;
    }
    Ok(fixture)
}

fn validate_fixtures(directory: &Path) -> Result<()> {
    let mut paths: Vec<_> = fs::read_dir(directory)
        .with_context(|| format!("read {}", directory.display()))?
        .map(|entry| entry.map(|item| item.path()))
        .collect::<std::io::Result<_>>()?;
    paths.retain(|path| {
        path.extension()
            .is_some_and(|extension| extension == "json")
    });
    paths.sort();
    if paths.is_empty() {
        bail!("fixture suite is empty");
    }
    for path in &paths {
        let fixture = load_fixture(path)?;
        let actual: Vec<ExpectedChart> = build_charts(&fixture.observations)
            .into_iter()
            .map(ExpectedChart::from)
            .collect();
        if actual != fixture.expected {
            bail!(
                "{}: rendered chart does not match golden output",
                fixture.name
            );
        }
    }
    println!("validated {} fixture files", paths.len());
    Ok(())
}

fn open_existing_store(path: &Path) -> Result<Store> {
    if !path.is_file() {
        bail!("local store does not exist: {}", path.display());
    }
    Store::open(path).with_context(|| format!("open {}", path.display()))
}

fn print_export(observations: &[verelle_core::Observation], format: Format) -> Result<()> {
    match format {
        Format::Json => println!("{}", observations_to_json(observations)?),
        Format::Csv => print!("{}", observations_to_csv(observations)?),
    }
    Ok(())
}
