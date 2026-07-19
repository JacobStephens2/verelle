use crate::{encrypted_storage, observation_label, upsert_observation};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::NaiveDate;
use js_sys::Date;
use leptos::{mount::mount_to_body, prelude::*};
use uuid::Uuid;
use verelle_core::{
    CycleStartBasis, GoldenFixture, MonitorReading, Observation, ObservationValue, VersionStamp,
    build_charts,
};
use verelle_crypto::{EncryptedEnvelope, SecretKey, open, seal};
use wasm_bindgen_futures::spawn_local;
use web_sys::{Storage, window};

const LEGACY_PLAINTEXT_STORAGE_KEY: &str = "verelle.synthetic-observations.v1";
const ENCRYPTED_STORAGE_KEY: &str = "verelle.synthetic-observations.v2.encrypted";
const SESSION_KEY_STORAGE_KEY: &str = "verelle.synthetic-session-key.v1";
const STORAGE_CONTEXT: &[u8] = b"verelle/web-local/v2";
const WEB_DEVICE_ID: &str = "web-preview-device";

pub fn mount() {
    mount_to_body(App);
}

#[component]
fn App() -> impl IntoView {
    let observations = RwSignal::new(Vec::new());
    let storage_ready = RwSignal::new(false);
    let date = RwSignal::new(today());
    let cycle_number = RwSignal::new("1".to_owned());
    let selected_reading = RwSignal::new(MonitorReading::Low);
    let notice = RwSignal::new(None::<String>);
    let crypto_ready = browser_crypto_round_trip();

    spawn_local(async move {
        match load_observations().await {
            Ok(loaded) => observations.set(loaded),
            Err(error) => notice.set(Some(error)),
        }
        storage_ready.set(true);
    });

    Effect::new(move |_| {
        let current = observations.get();
        if storage_ready.get() {
            spawn_local(async move {
                if let Err(error) = save_observations(&current).await {
                    notice.set(Some(error));
                }
            });
        }
    });

    let save_cycle_start = move |_| {
        let result = parse_record_date(&date.get()).and_then(|record_date| {
            let method_cycle_number = cycle_number
                .get()
                .parse::<u32>()
                .map_err(|_| "Enter a method cycle number greater than zero".to_owned())?;
            if method_cycle_number == 0 {
                return Err("Enter a method cycle number greater than zero".to_owned());
            }
            Ok(Observation {
                id: Uuid::new_v4(),
                date: record_date,
                value: ObservationValue::CycleStart {
                    cycle_id: Uuid::new_v4(),
                    basis: CycleStartBasis::Menses,
                    method_cycle_number: Some(method_cycle_number),
                    postpartum_cycle_number: None,
                },
                recorded_by: WEB_DEVICE_ID.to_owned(),
                version: web_version(),
            })
        });
        match result {
            Ok(observation) => {
                observations.update(|items| upsert_observation(items, observation));
                notice.set(Some(
                    "Synthetic cycle start saved in this browser".to_owned(),
                ));
            }
            Err(error) => notice.set(Some(error)),
        }
    };

    let save_monitor = move |_| match parse_record_date(&date.get()) {
        Ok(record_date) => {
            let observation = Observation {
                id: Uuid::new_v4(),
                date: record_date,
                value: ObservationValue::Monitor {
                    reading: selected_reading.get(),
                    test_requested: true,
                    test_time: None,
                    first_morning_urine: None,
                    error_code: None,
                },
                recorded_by: WEB_DEVICE_ID.to_owned(),
                version: web_version(),
            };
            observations.update(|items| upsert_observation(items, observation));
            notice.set(Some(
                "Synthetic monitor reading saved in this browser".to_owned(),
            ));
        }
        Err(error) => notice.set(Some(error)),
    };

    let load_demo = move |_| {
        let fixture: Result<GoldenFixture, _> =
            serde_json::from_str(include_str!("../../../fixtures/regular-cycle.json"));
        match fixture {
            Ok(fixture) => {
                observations.set(fixture.observations);
                notice.set(Some("Demo cycle loaded".to_owned()));
            }
            Err(_) => notice.set(Some("The bundled demo could not be loaded".to_owned())),
        }
    };

    let clear_demo = move |_| {
        storage_ready.set(false);
        observations.set(Vec::new());
        spawn_local(async move {
            let result = encrypted_storage::clear()
                .await
                .and_then(|()| clear_legacy_storage());
            notice.set(Some(match result {
                Ok(()) => "Synthetic browser data cleared".to_owned(),
                Err(error) => error,
            }));
            storage_ready.set(true);
        });
    };

    let charts = Memo::new(move |_| build_charts(&observations.get()));

    view! {
        <div class="app-shell">
            <header class="topbar">
                <a class="brand" href="#top" aria-label="Verelle home">
                    <span class="brand-mark" aria-hidden="true">"V"</span>
                    <span>"verelle"</span>
                </a>
                <div class="topbar-actions">
                    <span class="local-pill"><span class="status-dot"></span>"Encrypted browser"</span>
                    <button class="quiet-button" type="button" on:click=load_demo>"Load demo"</button>
                    <button class="quiet-button danger" type="button" on:click=clear_demo>"Clear"</button>
                </div>
            </header>

            <main id="top">
                <section class="hero">
                    <div>
                        <p class="eyebrow">"Private charting, thoughtfully made"</p>
                        <h1>"A calm place for the facts of each day."</h1>
                        <p class="hero-copy">
                            "Record observations and see them in a clear cycle chart. Verelle displays what you enter; it does not interpret fertility."
                        </p>
                    </div>
                    <div class="assurance-card">
                        <span class="assurance-icon" aria-hidden="true">"✓"</span>
                        <div>
                            <strong>{if crypto_ready { "WASM crypto check passed" } else { "WASM crypto check failed" }}</strong>
                            <p>"The shared Rust encryption path ran inside this browser session."</p>
                        </div>
                    </div>
                </section>

                <div class="safety-banner" role="note">
                    <strong>"Synthetic testing only."</strong>
                    " Durable browser data is encrypted in IndexedDB with a non-extractable browser key, but accounts and recovery are not ready. Do not enter real health data."
                </div>

                <section class="workspace">
                    <aside class="record-panel">
                        <div class="section-heading">
                            <span class="step-number">"01"</span>
                            <div>
                                <p class="eyebrow">"Record"</p>
                                <h2>"Today’s observation"</h2>
                            </div>
                        </div>

                        <label class="field">
                            <span>"Date"</span>
                            <input
                                type="date"
                                prop:value=move || date.get()
                                on:input=move |event| date.set(event_target_value(&event))
                            />
                        </label>

                        <div class="cycle-start-box">
                            <label class="field compact">
                                <span>"Method cycle"</span>
                                <input
                                    type="number"
                                    min="1"
                                    inputmode="numeric"
                                    prop:value=move || cycle_number.get()
                                    on:input=move |event| cycle_number.set(event_target_value(&event))
                                />
                            </label>
                            <button class="secondary-button" type="button" on:click=save_cycle_start>
                                "Start cycle"
                            </button>
                        </div>

                        <fieldset>
                            <legend>"Monitor reading"</legend>
                            <div class="reading-grid">
                                <ReadingChip label="Low" value=MonitorReading::Low selected=selected_reading />
                                <ReadingChip label="High" value=MonitorReading::High selected=selected_reading />
                                <ReadingChip label="Peak" value=MonitorReading::Peak selected=selected_reading />
                                <ReadingChip label="Missed" value=MonitorReading::Missed selected=selected_reading />
                                <ReadingChip label="Error" value=MonitorReading::Error selected=selected_reading />
                            </div>
                        </fieldset>

                        <button class="primary-button" type="button" on:click=save_monitor>
                            <span>"Save reading"</span><span aria-hidden="true">"→"</span>
                        </button>

                        {move || notice.get().map(|message| view! { <p class="notice" role="status">{message}</p> })}

                        <div class="local-facts">
                            <div><span>"Saved facts"</span><strong>{move || observations.get().len()}</strong></div>
                            <div><span>"Cloud sync"</span><strong>"Review gated"</strong></div>
                        </div>
                    </aside>

                    <section class="chart-panel">
                        <div class="chart-toolbar">
                            <div class="section-heading">
                                <span class="step-number">"02"</span>
                                <div>
                                    <p class="eyebrow">"Review"</p>
                                    <h2>"Cycle chart"</h2>
                                </div>
                            </div>
                            <div class="legend" aria-label="Chart legend">
                                <span><i class="legend-dot low"></i>"Low"</span>
                                <span><i class="legend-dot high"></i>"High"</span>
                                <span><i class="legend-dot peak"></i>"Peak"</span>
                            </div>
                        </div>

                        {move || {
                            let latest = charts.get().last().cloned();
                            match latest {
                                Some(chart) => view! {
                                    <div class="chart-meta">
                                        <div>
                                            <span>"Cycle"</span>
                                            <strong>{chart.method_cycle_number}</strong>
                                        </div>
                                        <div>
                                            <span>"Started"</span>
                                            <strong>{chart.start_date.to_string()}</strong>
                                        </div>
                                        <div>
                                            <span>"Recorded days"</span>
                                            <strong>{chart.days.iter().filter(|day| !day.observations.is_empty()).count()}</strong>
                                        </div>
                                    </div>
                                }.into_any(),
                                None => view! { <div class="chart-meta empty-meta">"No cycle yet"</div> }.into_any(),
                            }
                        }}

                        <div class="chart-days">
                            <For
                                each=move || charts.get().last().map(|chart| chart.days.clone()).unwrap_or_default()
                                key=|day| day.date
                                children=move |day| {
                                    let date = day.date.to_string();
                                    let observations = day.observations;
                                    let annotations = day.annotations;
                                    view! {
                                        <article class="day-row">
                                            <div class="day-number">
                                                <span>"CD"</span>
                                                <strong>{day.cycle_day}</strong>
                                            </div>
                                            <div class="day-date">{friendly_date(&date)}</div>
                                            <div class="day-facts">
                                                {if observations.is_empty() {
                                                    view! { <span class="empty-day">"No entry"</span> }.into_any()
                                                } else {
                                                    observations.into_iter().map(|observation| {
                                                        let marker = observation.value.marker_type().to_string();
                                                        view! {
                                                            <span class=format!("fact-chip {marker}")>
                                                                {observation_label(&observation.value)}
                                                            </span>
                                                        }
                                                    }).collect_view().into_any()
                                                }}
                                            </div>
                                            <div class="annotations">
                                                {annotations.into_iter().map(|annotation| view! {
                                                    <span>{annotation.label()}</span>
                                                }).collect_view()}
                                            </div>
                                        </article>
                                    }
                                }
                            />
                            <Show
                                when=move || charts.get().is_empty()
                                fallback=|| ()
                            >
                                <div class="empty-state">
                                    <div class="empty-orbit" aria-hidden="true"><span></span></div>
                                    <h3>"Your synthetic chart starts here"</h3>
                                    <p>"Start a cycle and save a monitor reading, or load the bundled demo."</p>
                                </div>
                            </Show>
                        </div>
                    </section>
                </section>
            </main>

            <footer>
                <span>"Verelle preview"</span>
                <span>"Record and display only · No analytics · Sync review-gated"</span>
            </footer>
        </div>
    }
}

#[component]
fn ReadingChip(
    label: &'static str,
    value: MonitorReading,
    selected: RwSignal<MonitorReading>,
) -> impl IntoView {
    view! {
        <button
            type="button"
            class=move || if selected.get() == value { "reading-chip selected" } else { "reading-chip" }
            on:click=move |_| selected.set(value)
        >
            <span class=format!("reading-symbol {}", label.to_lowercase())></span>
            {label}
        </button>
    }
}

fn parse_record_date(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| "Choose a valid recording date".to_owned())
}

fn web_version() -> VersionStamp {
    #[allow(clippy::cast_possible_truncation)]
    let physical_ms = Date::now() as i64;
    VersionStamp::new(physical_ms, 0, WEB_DEVICE_ID)
}

fn today() -> String {
    let iso: String = Date::new_0().to_iso_string().into();
    iso.chars().take(10).collect()
}

fn friendly_date(value: &str) -> String {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").map_or_else(
        |_| value.to_owned(),
        |date| date.format("%a, %b %-d").to_string(),
    )
}

fn browser_crypto_round_trip() -> bool {
    let key = SecretKey::from_bytes([42_u8; 32]);
    let context = b"verelle/web-spike/v1";
    let plaintext = b"browser crypto round trip";
    seal(&key, 1, context, plaintext)
        .and_then(|envelope| open(&key, 1, context, &envelope))
        .is_ok_and(|opened| opened == plaintext)
}

fn browser_storage() -> Result<Storage, String> {
    window()
        .ok_or_else(|| "Browser window is unavailable".to_owned())?
        .local_storage()
        .map_err(|_| "Browser storage is unavailable".to_owned())?
        .ok_or_else(|| "Browser storage is disabled".to_owned())
}

fn browser_session_storage() -> Result<Storage, String> {
    window()
        .ok_or_else(|| "Browser window is unavailable".to_owned())?
        .session_storage()
        .map_err(|_| "Browser session storage is unavailable".to_owned())?
        .ok_or_else(|| "Browser session storage is disabled".to_owned())
}

fn preview_storage_key() -> Result<SecretKey, String> {
    let session = browser_session_storage()?;
    if let Some(encoded) = session
        .get_item(SESSION_KEY_STORAGE_KEY)
        .map_err(|_| "Browser session key could not be read".to_owned())?
    {
        let mut bytes = URL_SAFE_NO_PAD
            .decode(encoded)
            .map_err(|_| "Browser session key is invalid".to_owned())?;
        if bytes.len() != 32 {
            bytes.fill(0);
            return Err("Browser session key is invalid".to_owned());
        }
        let mut key = [0_u8; 32];
        key.copy_from_slice(&bytes);
        bytes.fill(0);
        return Ok(SecretKey::from_bytes(key));
    }

    let mut key = [0_u8; 32];
    getrandom::getrandom(&mut key)
        .map_err(|_| "A browser encryption key could not be generated".to_owned())?;
    session
        .set_item(SESSION_KEY_STORAGE_KEY, &URL_SAFE_NO_PAD.encode(key))
        .map_err(|_| "Browser session key could not be retained".to_owned())?;
    Ok(SecretKey::from_bytes(key))
}

async fn load_observations() -> Result<Vec<Observation>, String> {
    if let Some(value) = encrypted_storage::load().await? {
        let observations = serde_json::from_str(&value)
            .map_err(|_| "Stored encrypted browser data is invalid".to_owned())?;
        clear_legacy_storage()?;
        return Ok(observations);
    }

    let Some(observations) = load_legacy_observations()? else {
        return Ok(Vec::new());
    };
    let value = serde_json::to_string(&observations)
        .map_err(|_| "Synthetic observations could not be encoded".to_owned())?;
    encrypted_storage::save(&value).await?;
    clear_legacy_storage()?;
    Ok(observations)
}

fn load_legacy_observations() -> Result<Option<Vec<Observation>>, String> {
    let storage = browser_storage()?;
    if let Some(value) = storage
        .get_item(ENCRYPTED_STORAGE_KEY)
        .map_err(|_| "Browser storage could not be read".to_owned())?
    {
        let key = preview_storage_key()?;
        return decode_observations(&key, &value).map(Some);
    }

    let Some(legacy) = storage
        .get_item(LEGACY_PLAINTEXT_STORAGE_KEY)
        .map_err(|_| "Legacy browser storage could not be read".to_owned())?
    else {
        return Ok(None);
    };
    let observations: Vec<Observation> =
        serde_json::from_str(&legacy).map_err(|_| "Stored synthetic data is invalid".to_owned())?;
    Ok(Some(observations))
}

async fn save_observations(observations: &[Observation]) -> Result<(), String> {
    let value = serde_json::to_string(observations)
        .map_err(|_| "Synthetic observations could not be encoded".to_owned())?;
    encrypted_storage::save(&value).await
}

fn clear_legacy_storage() -> Result<(), String> {
    let local = browser_storage()?;
    local
        .remove_item(ENCRYPTED_STORAGE_KEY)
        .and_then(|()| local.remove_item(LEGACY_PLAINTEXT_STORAGE_KEY))
        .map_err(|_| "Legacy browser storage could not be cleared".to_owned())?;
    browser_session_storage()?
        .remove_item(SESSION_KEY_STORAGE_KEY)
        .map_err(|_| "Legacy browser session storage could not be cleared".to_owned())
}

fn decode_observations(key: &SecretKey, encoded: &str) -> Result<Vec<Observation>, String> {
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| "Stored synthetic ciphertext is invalid".to_owned())?;
    let envelope = EncryptedEnvelope::from_bytes(&bytes)
        .map_err(|_| "Stored synthetic ciphertext is invalid".to_owned())?;
    let plaintext = open(key, 1, STORAGE_CONTEXT, &envelope)
        .map_err(|_| "Stored synthetic data cannot be unlocked in this session".to_owned())?;
    serde_json::from_slice(&plaintext).map_err(|_| "Stored synthetic data is invalid".to_owned())
}
