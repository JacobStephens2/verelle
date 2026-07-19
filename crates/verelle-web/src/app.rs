use crate::{
    account::{self, BrowserVault},
    encrypted_storage, observation_label,
};
use chrono::NaiveDate;
use js_sys::Date;
use leptos::{mount::mount_to_body, prelude::*};
use uuid::Uuid;
use verelle_core::{
    CycleStartBasis, MonitorReading, Observation, ObservationValue, VersionStamp, build_charts,
};
use verelle_crypto::{SecretKey, open, seal};
use wasm_bindgen_futures::spawn_local;

const WEB_PREVIEW_DEVICE_ID: &str = "web-preview-device";

pub fn mount() {
    mount_to_body(App);
}

#[component]
fn App() -> impl IntoView {
    let vault = RwSignal::new(BrowserVault::default());
    let storage_ready = RwSignal::new(false);
    let busy = RwSignal::new(false);
    let date = RwSignal::new(today());
    let cycle_number = RwSignal::new("1".to_owned());
    let selected_reading = RwSignal::new(MonitorReading::Low);
    let notice = RwSignal::new(None::<String>);
    let email = RwSignal::new(String::new());
    let password = RwSignal::new(String::new());
    let password_confirmation = RwSignal::new(String::new());
    let health_consent = RwSignal::new(false);
    let recovery_acknowledged = RwSignal::new(false);
    let deletion_confirmation = RwSignal::new(String::new());
    let crypto_ready = browser_crypto_round_trip();

    spawn_local(async move {
        match account::load_vault().await {
            Ok(loaded) => {
                if let Some(account) = &loaded.account {
                    email.set(account.email.clone());
                }
                let should_sync = loaded.active_session()
                    && loaded
                        .account
                        .as_ref()
                        .is_some_and(|value| value.recovery_code_pending_acknowledgement.is_none());
                vault.set(loaded);
                storage_ready.set(true);
                if should_sync {
                    persist_and_sync(vault, busy, notice);
                }
            }
            Err(error) => {
                notice.set(Some(error));
                storage_ready.set(true);
            }
        }
    });

    let observations = Memo::new(move |_| vault.get().observations().unwrap_or_default());
    let charts = Memo::new(move |_| build_charts(&observations.get()));
    let can_record = Memo::new(move |_| {
        storage_ready.get()
            && !busy.get()
            && vault.get().active_session()
            && vault
                .get()
                .account
                .as_ref()
                .is_some_and(|account| account.recovery_code_pending_acknowledgement.is_none())
    });

    let register = move |_| {
        if busy.get_untracked() {
            return;
        }
        if !health_consent.get_untracked() {
            notice.set(Some(
                "Read the consumer health-data policy and provide affirmative consent".to_owned(),
            ));
            return;
        }
        let entered_password = password.get_untracked();
        if entered_password != password_confirmation.get_untracked() {
            notice.set(Some("The passwords do not match".to_owned()));
            return;
        }
        let entered_email = email.get_untracked();
        password.set(String::new());
        password_confirmation.set(String::new());
        busy.set(true);
        notice.set(Some("Creating the encrypted account…".to_owned()));
        let current = vault.get_untracked();
        spawn_local(async move {
            match account::register(current, entered_email, entered_password).await {
                Ok(registered) => {
                    vault.set(registered);
                    notice.set(Some(
                        "Account created. Save the recovery code before recording data.".to_owned(),
                    ));
                }
                Err(error) => notice.set(Some(error)),
            }
            busy.set(false);
        });
    };

    let sign_in = move |_| {
        if busy.get_untracked() {
            return;
        }
        let mut entered_password = password.get_untracked();
        password.set(String::new());
        busy.set(true);
        notice.set(Some("Signing in with OPAQUE and device proof…".to_owned()));
        let mut current = vault.get_untracked();
        spawn_local(async move {
            let result = account::login(&mut current, &mut entered_password).await;
            match result {
                Ok(()) => match account::save_vault(&current).await {
                    Ok(()) => {
                        vault.set(current);
                        notice.set(Some("Signed in securely".to_owned()));
                    }
                    Err(error) => notice.set(Some(error)),
                },
                Err(error) => notice.set(Some(error)),
            }
            busy.set(false);
        });
    };

    let sign_out = move |_| {
        if busy.get_untracked() {
            return;
        }
        busy.set(true);
        let mut current = vault.get_untracked();
        spawn_local(async move {
            match account::logout(&mut current).await {
                Ok(()) => {
                    vault.set(current);
                    notice.set(Some("Signed out on this browser".to_owned()));
                }
                Err(error) => notice.set(Some(error)),
            }
            busy.set(false);
        });
    };

    let acknowledge_recovery = move |_| {
        if !recovery_acknowledged.get_untracked() || busy.get_untracked() {
            notice.set(Some(
                "Confirm that the recovery code is stored somewhere safe".to_owned(),
            ));
            return;
        }
        let mut current = vault.get_untracked();
        current.acknowledge_recovery_code();
        vault.set(current);
        recovery_acknowledged.set(false);
        persist_and_sync(vault, busy, notice);
    };

    let clear_preview = move |_| {
        if vault.get_untracked().account.is_some() || busy.get_untracked() {
            return;
        }
        busy.set(true);
        spawn_local(async move {
            match encrypted_storage::clear().await {
                Ok(()) => {
                    vault.set(BrowserVault::default());
                    notice.set(Some("Local preview data cleared".to_owned()));
                }
                Err(error) => notice.set(Some(error)),
            }
            busy.set(false);
        });
    };

    let save_cycle_start = move |_| {
        if !can_record.get_untracked() {
            notice.set(Some(
                "Sign in and save the recovery code before recording health data".to_owned(),
            ));
            return;
        }
        let result = parse_record_date(&date.get_untracked()).and_then(|record_date| {
            let method_cycle_number = cycle_number
                .get_untracked()
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
                recorded_by: current_device_id(&vault.get_untracked()),
                version: web_version(&vault.get_untracked()),
            })
        });
        record_and_sync(
            result,
            vault,
            busy,
            notice,
            "Cycle start encrypted and saved",
        );
    };

    let save_monitor = move |_| {
        if !can_record.get_untracked() {
            notice.set(Some(
                "Sign in and save the recovery code before recording health data".to_owned(),
            ));
            return;
        }
        let result = parse_record_date(&date.get_untracked()).map(|record_date| Observation {
            id: Uuid::new_v4(),
            date: record_date,
            value: ObservationValue::Monitor {
                reading: selected_reading.get_untracked(),
                test_requested: true,
                test_time: None,
                first_morning_urine: None,
                error_code: None,
            },
            recorded_by: current_device_id(&vault.get_untracked()),
            version: web_version(&vault.get_untracked()),
        });
        record_and_sync(
            result,
            vault,
            busy,
            notice,
            "Monitor reading encrypted and saved",
        );
    };

    let sync_now = move |_| persist_and_sync(vault, busy, notice);

    let delete_account = move |_| {
        if deletion_confirmation.get_untracked() != "DELETE" || busy.get_untracked() {
            notice.set(Some(
                "Type DELETE to confirm permanent account deletion".to_owned(),
            ));
            return;
        }
        busy.set(true);
        let current = vault.get_untracked();
        spawn_local(async move {
            match account::delete_account(&current).await {
                Ok((deletion_id, true)) => {
                    vault.set(BrowserVault::default());
                    email.set(String::new());
                    deletion_confirmation.set(String::new());
                    notice.set(Some(format!("Account deleted · receipt {deletion_id}")));
                }
                Ok((deletion_id, false)) => notice.set(Some(format!(
                    "Server account deleted · receipt {deletion_id} · local browser cleanup failed; clear site data before using Verelle again"
                ))),
                Err(error) => notice.set(Some(error)),
            }
            busy.set(false);
        });
    };

    view! {
        <div class="app-shell">
            <header class="topbar">
                <a class="brand" href="#top" aria-label="Verelle home">
                    <span class="brand-mark" aria-hidden="true">"V"</span>
                    <span>"verelle"</span>
                </a>
                <div class="topbar-actions">
                    <span class="local-pill"><span class="status-dot"></span>{move || account_status(&vault.get())}</span>
                    <Show when=move || vault.get().account.is_none() && !vault.get().local_observations.is_empty()>
                        <button class="quiet-button danger" type="button" on:click=clear_preview disabled=move || busy.get()>"Clear preview"</button>
                    </Show>
                    <Show when=move || vault.get().active_session()>
                        <button class="quiet-button" type="button" on:click=sync_now disabled=move || busy.get()>"Sync"</button>
                        <button class="quiet-button" type="button" on:click=sign_out disabled=move || busy.get()>"Sign out"</button>
                    </Show>
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
                            <strong>{if crypto_ready { "Browser encryption ready" } else { "Browser encryption failed" }}</strong>
                            <p>"Chart data is encrypted before sync; the server stores ciphertext and bounded metadata."</p>
                        </div>
                    </div>
                </section>

                <AuthPanel
                    vault=vault
                    busy=busy
                    email=email
                    password=password
                    password_confirmation=password_confirmation
                    health_consent=health_consent
                    recovery_acknowledged=recovery_acknowledged
                    notice=notice
                    register=Callback::new(register)
                    sign_in=Callback::new(sign_in)
                    acknowledge_recovery=Callback::new(acknowledge_recovery)
                />

                <div class=move || if can_record.get() { "safety-banner ready" } else { "safety-banner" } role="note">
                    <strong>{move || if can_record.get() { "Encrypted account mode." } else { "Recording locked." }}</strong>
                    {move || if can_record.get() {
                        " Verelle records and displays facts only; it does not provide medical or fertility guidance."
                    } else {
                        " Create or sign in to an account and save the recovery code before entering health data."
                    }}
                </div>

                <section class="workspace">
                    <aside class="record-panel">
                        <div class="section-heading">
                            <span class="step-number">"01"</span>
                            <div><p class="eyebrow">"Record"</p><h2>"Today’s observation"</h2></div>
                        </div>
                        <label class="field"><span>"Date"</span><input type="date" prop:value=move || date.get() on:input=move |event| date.set(event_target_value(&event)) disabled=move || !can_record.get()/></label>
                        <div class="cycle-start-box">
                            <label class="field compact"><span>"Method cycle"</span><input type="number" min="1" inputmode="numeric" prop:value=move || cycle_number.get() on:input=move |event| cycle_number.set(event_target_value(&event)) disabled=move || !can_record.get()/></label>
                            <button class="secondary-button" type="button" on:click=save_cycle_start disabled=move || !can_record.get()>"Start cycle"</button>
                        </div>
                        <fieldset disabled=move || !can_record.get()>
                            <legend>"Monitor reading"</legend>
                            <div class="reading-grid">
                                <ReadingChip label="Low" value=MonitorReading::Low selected=selected_reading />
                                <ReadingChip label="High" value=MonitorReading::High selected=selected_reading />
                                <ReadingChip label="Peak" value=MonitorReading::Peak selected=selected_reading />
                                <ReadingChip label="Missed" value=MonitorReading::Missed selected=selected_reading />
                                <ReadingChip label="Error" value=MonitorReading::Error selected=selected_reading />
                            </div>
                        </fieldset>
                        <button class="primary-button" type="button" on:click=save_monitor disabled=move || !can_record.get()><span>"Save reading"</span><span aria-hidden="true">"→"</span></button>
                        {move || notice.get().map(|message| view! { <p class="notice" role="status">{message}</p> })}
                        <div class="local-facts">
                            <div><span>"Saved facts"</span><strong>{move || observations.get().len()}</strong></div>
                            <div><span>"Cloud sync"</span><strong>{move || sync_status(&vault.get(), busy.get())}</strong></div>
                        </div>
                    </aside>

                    <section class="chart-panel">
                        <div class="chart-toolbar">
                            <div class="section-heading"><span class="step-number">"02"</span><div><p class="eyebrow">"Review"</p><h2>"Cycle chart"</h2></div></div>
                            <div class="legend" aria-label="Chart legend"><span><i class="legend-dot low"></i>"Low"</span><span><i class="legend-dot high"></i>"High"</span><span><i class="legend-dot peak"></i>"Peak"</span></div>
                        </div>
                        {move || chart_meta(&charts.get())}
                        <div class="chart-days">
                            <For each=move || charts.get().last().map(|chart| chart.days.clone()).unwrap_or_default() key=|day| day.date children=chart_day />
                            <Show when=move || charts.get().is_empty() fallback=|| ()>
                                <div class="empty-state"><div class="empty-orbit" aria-hidden="true"><span></span></div><h3>"Your chart starts here"</h3><p>"Create an account, store the recovery code, then record a cycle start and daily observations."</p></div>
                            </Show>
                        </div>
                    </section>
                </section>

                <Show when=move || vault.get().active_session()>
                    <section class="danger-zone">
                        <h2>"Delete account and chart"</h2>
                        <p>"This permanently deletes the account and encrypted server chart. It cannot be undone. Export requirements remain an open launch gate."</p>
                        <label class="field"><span>"Type DELETE"</span><input type="text" prop:value=move || deletion_confirmation.get() on:input=move |event| deletion_confirmation.set(event_target_value(&event))/></label>
                        <button class="quiet-button danger" type="button" on:click=delete_account disabled=move || busy.get()>"Delete permanently"</button>
                    </section>
                </Show>
            </main>

            <footer>
                <span>"Verelle · End-to-end encrypted record and display"</span>
                <span><a href="/consumer-health-data-privacy.html">"Consumer Health Data Privacy Policy"</a>" · Not medical advice"</span>
            </footer>
        </div>
    }
}

#[component]
#[allow(clippy::too_many_arguments)]
fn AuthPanel(
    vault: RwSignal<BrowserVault>,
    busy: RwSignal<bool>,
    email: RwSignal<String>,
    password: RwSignal<String>,
    password_confirmation: RwSignal<String>,
    health_consent: RwSignal<bool>,
    recovery_acknowledged: RwSignal<bool>,
    notice: RwSignal<Option<String>>,
    register: Callback<leptos::ev::MouseEvent>,
    sign_in: Callback<leptos::ev::MouseEvent>,
    acknowledge_recovery: Callback<leptos::ev::MouseEvent>,
) -> impl IntoView {
    let reset_interrupted_signup = move |_| {
        if busy.get_untracked() {
            return;
        }
        busy.set(true);
        let current = vault.get_untracked();
        spawn_local(async move {
            match account::abandon_pending_registration(&current).await {
                Ok(reset) => {
                    vault.set(reset);
                    email.set(String::new());
                    password.set(String::new());
                    notice.set(Some(
                        "Interrupted browser signup reset; you can register again".to_owned(),
                    ));
                }
                Err(error) => notice.set(Some(error)),
            }
            busy.set(false);
        });
    };

    view! {
        <section class="account-panel">
            <Show when=move || vault.get().account.is_none()>
                <div><p class="eyebrow">"Private account"</p><h2>"Create your encrypted chart"</h2><p>"Your password is processed with OPAQUE and is never sent to Verelle. This browser creates a non-exportable device signing key."</p></div>
                <div class="account-form">
                    <label class="field"><span>"Email"</span><input type="email" autocomplete="email" prop:value=move || email.get() on:input=move |event| email.set(event_target_value(&event))/></label>
                    <label class="field"><span>"Password (12+ characters)"</span><input type="password" autocomplete="new-password" prop:value=move || password.get() on:input=move |event| password.set(event_target_value(&event))/></label>
                    <label class="field"><span>"Confirm password"</span><input type="password" autocomplete="new-password" prop:value=move || password_confirmation.get() on:input=move |event| password_confirmation.set(event_target_value(&event))/></label>
                    <div class="consent-request">
                        <strong>"Consent to collect consumer health data"</strong>
                        <p>"Verelle will collect the cycle dates, monitor readings, and other reproductive-health observations you choose to enter; account and device identifiers; and service metadata. It uses them only to create your chart, encrypt and synchronize it, secure your account, operate backups, and honor deletion requests. Chart content is encrypted in this browser before it is sent to the DigitalOcean-hosted service; traffic may transit Cloudflare while DNS changes propagate, and encrypted backups are stored with Amazon Web Services. Verelle does not sell health data, use it for advertising, or disclose it to third parties for their own purposes. You can withdraw consent and delete your account in this app, or contact jacob@stephens.page."</p>
                        <label class="consent"><input type="checkbox" prop:checked=move || health_consent.get() on:change=move |event| health_consent.set(event_target_checked(&event))/><span>"I affirmatively consent to that collection for those purposes, after reading the separate "<a href="/consumer-health-data-privacy.html" target="_blank" rel="noopener">"Consumer Health Data Privacy Policy"</a>"."</span></label>
                    </div>
                    <button class="primary-button" type="button" on:click=move |event| register.run(event) disabled=move || busy.get()><span>"Create encrypted account"</span><span>"→"</span></button>
                </div>
            </Show>

            <Show when=move || vault.get().account.is_some() && !vault.get().active_session()>
                <div><p class="eyebrow">"Welcome back"</p><h2>"Sign in on this enrolled browser"</h2><p>"OPAQUE verifies the password; a P-256 device signature proves this browser still holds the enrolled private key."</p></div>
                <div class="account-form">
                    <label class="field"><span>"Enrolled email"</span><input type="email" prop:value=move || email.get() readonly/></label>
                    <label class="field"><span>"Password"</span><input type="password" autocomplete="current-password" prop:value=move || password.get() on:input=move |event| password.set(event_target_value(&event))/></label>
                    <button class="primary-button" type="button" on:click=move |event| sign_in.run(event) disabled=move || busy.get()><span>"Sign in"</span><span>"→"</span></button>
                    <p class="form-note">"New-device and lost-browser recovery are not ready. Do not clear this browser until recovery has been implemented and verified."</p>
                    <Show when=move || vault.get().account.as_ref().is_some_and(|account| account.account_id.is_none() && account.pending_registration.is_some())>
                        <button class="quiet-button danger" type="button" on:click=reset_interrupted_signup disabled=move || busy.get()>"Reset interrupted signup"</button>
                    </Show>
                </div>
            </Show>

            <Show when=move || vault.get().account.as_ref().and_then(|account| account.recovery_code_pending_acknowledgement.clone()).is_some()>
                <div><p class="eyebrow">"One-time recovery code"</p><h2>"Store this code offline"</h2><p>"Anyone with this code may eventually recover the account. Verelle cannot replace it."</p></div>
                <div class="account-form recovery-card">
                    <code>{move || vault.get().account.and_then(|account| account.recovery_code_pending_acknowledgement).unwrap_or_default()}</code>
                    <label class="consent"><input type="checkbox" prop:checked=move || recovery_acknowledged.get() on:change=move |event| recovery_acknowledged.set(event_target_checked(&event))/><span>"I stored this recovery code somewhere private and separate from this browser."</span></label>
                    <button class="primary-button" type="button" on:click=move |event| acknowledge_recovery.run(event) disabled=move || busy.get()><span>"I saved it; unlock recording"</span><span>"→"</span></button>
                </div>
            </Show>

            <Show when=move || vault.get().active_session() && vault.get().account.as_ref().is_some_and(|account| account.recovery_code_pending_acknowledgement.is_none())>
                <div><p class="eyebrow">"Account ready"</p><h2>{move || vault.get().account.map(|account| account.email).unwrap_or_default()}</h2><p>"This browser is enrolled and the current session is active. New observations are encrypted locally before sync."</p></div>
                <div class="account-ready-mark">"Encrypted · authenticated · deletion available"</div>
            </Show>
        </section>
    }
}

#[component]
fn ReadingChip(
    label: &'static str,
    value: MonitorReading,
    selected: RwSignal<MonitorReading>,
) -> impl IntoView {
    view! {
        <button type="button" class=move || if selected.get() == value { "reading-chip selected" } else { "reading-chip" } on:click=move |_| selected.set(value)>
            <span class=format!("reading-symbol {}", label.to_lowercase())></span>{label}
        </button>
    }
}

fn record_and_sync(
    observation: Result<Observation, String>,
    vault: RwSignal<BrowserVault>,
    busy: RwSignal<bool>,
    notice: RwSignal<Option<String>>,
    success_message: &'static str,
) {
    let result = observation.and_then(|observation| {
        let mut current = vault.get_untracked();
        current.append_observation(observation)?;
        vault.set(current);
        Ok(())
    });
    match result {
        Ok(()) => {
            notice.set(Some(success_message.to_owned()));
            persist_and_sync(vault, busy, notice);
        }
        Err(error) => notice.set(Some(error)),
    }
}

fn persist_and_sync(
    vault: RwSignal<BrowserVault>,
    busy: RwSignal<bool>,
    notice: RwSignal<Option<String>>,
) {
    if busy.get_untracked() {
        return;
    }
    busy.set(true);
    let mut current = vault.get_untracked();
    spawn_local(async move {
        let result = async {
            account::save_vault(&current).await?;
            if current.active_session() {
                let summary = current.sync().await?;
                account::save_vault(&current).await?;
                Ok::<_, String>(summary)
            } else {
                Ok(crate::sync_runtime::SyncSummary {
                    pushed: 0,
                    pulled: 0,
                })
            }
        }
        .await;
        match result {
            Ok(summary) => {
                vault.set(current);
                notice.set(Some(format!(
                    "Encrypted sync complete · {} pushed · {} pulled",
                    summary.pushed, summary.pulled
                )));
            }
            Err(error) => notice.set(Some(format!(
                "Saved locally; sync did not complete: {error}"
            ))),
        }
        busy.set(false);
    });
}

fn chart_meta(charts: &[verelle_core::CycleChart]) -> AnyView {
    charts.last().map_or_else(
        || view! { <div class="chart-meta empty-meta">"No cycle yet"</div> }.into_any(),
        |chart| {
            let cycle = chart.method_cycle_number;
            let start = chart.start_date.to_string();
            let days = chart
                .days
                .iter()
                .filter(|day| !day.observations.is_empty())
                .count();
            view! { <div class="chart-meta"><div><span>"Cycle"</span><strong>{cycle}</strong></div><div><span>"Started"</span><strong>{start}</strong></div><div><span>"Recorded days"</span><strong>{days}</strong></div></div> }.into_any()
        },
    )
}

fn chart_day(day: verelle_core::DayCell) -> impl IntoView {
    let date = day.date.to_string();
    let observations = day.observations;
    let annotations = day.annotations;
    view! {
        <article class="day-row">
            <div class="day-number"><span>"CD"</span><strong>{day.cycle_day}</strong></div>
            <div class="day-date">{friendly_date(&date)}</div>
            <div class="day-facts">{if observations.is_empty() { view! { <span class="empty-day">"No entry"</span> }.into_any() } else { observations.into_iter().map(|observation| { let marker = observation.value.marker_type().to_string(); view! { <span class=format!("fact-chip {marker}")>{observation_label(&observation.value)}</span> } }).collect_view().into_any() }}</div>
            <div class="annotations">{annotations.into_iter().map(|annotation| view! { <span>{annotation.label()}</span> }).collect_view()}</div>
        </article>
    }
}

fn parse_record_date(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| "Choose a valid recording date".to_owned())
}

fn web_version(vault: &BrowserVault) -> VersionStamp {
    #[allow(clippy::cast_possible_truncation)]
    let physical_ms = Date::now() as i64;
    VersionStamp::new(physical_ms, 0, current_device_id(vault))
}

fn current_device_id(vault: &BrowserVault) -> String {
    vault.account.as_ref().map_or_else(
        || WEB_PREVIEW_DEVICE_ID.to_owned(),
        |account| account.device_id.to_string(),
    )
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
    seal(
        &key,
        1,
        b"verelle/web-self-test/v1",
        b"browser crypto round trip",
    )
    .and_then(|envelope| open(&key, 1, b"verelle/web-self-test/v1", &envelope))
    .is_ok_and(|opened| opened == b"browser crypto round trip")
}

fn account_status(vault: &BrowserVault) -> &'static str {
    if vault.active_session() {
        "Encrypted account"
    } else if vault.account.is_some() {
        "Sign-in required"
    } else {
        "Local preview"
    }
}

fn sync_status(vault: &BrowserVault, busy: bool) -> &'static str {
    if busy {
        "Working"
    } else if vault.active_session() {
        if vault.sync.outbox.is_empty() {
            "Current"
        } else {
            "Pending"
        }
    } else {
        "Signed out"
    }
}
