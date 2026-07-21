use crate::{
    account::{self, BrowserVault},
    encrypted_storage, observation_label,
};
use chrono::{NaiveDate, NaiveTime};
use js_sys::Date;
use leptos::{mount::mount_to_body, prelude::*};
use std::time::Duration;
use uuid::Uuid;
use verelle_core::{
    BleedingIntensity, CycleStartBasis, IntercourseKind, LhQualitative, MonitorReading,
    MucusCategory, Observation, ObservationValue, PeakSource, TemperatureUnit, VersionStamp,
    build_charts,
};
use verelle_crypto::{SecretKey, open, seal};
use wasm_bindgen_futures::spawn_local;

const WEB_PREVIEW_DEVICE_ID: &str = "web-preview-device";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum AuthEntryMode {
    #[default]
    Create,
    SignIn,
    Recover,
}

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
    let supplemental_kind = RwSignal::new("bleeding".to_owned());
    let supplemental_primary = RwSignal::new("spotting".to_owned());
    let supplemental_secondary = RwSignal::new(String::new());
    let supplemental_flag = RwSignal::new(false);
    let notice = RwSignal::new(None::<String>);
    let email = RwSignal::new(String::new());
    let password = RwSignal::new(String::new());
    let password_confirmation = RwSignal::new(String::new());
    let health_consent = RwSignal::new(false);
    let recovery_acknowledged = RwSignal::new(false);
    let recovery_code = RwSignal::new(String::new());
    let deletion_confirmation = RwSignal::new(String::new());
    let couple_invite_code = RwSignal::new(String::new());
    let generated_invite_code = RwSignal::new(String::new());
    let entitlement_status = RwSignal::new("Not checked".to_owned());
    let auth_entry_mode = RwSignal::new(AuthEntryMode::default());
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
                    persist_and_sync(vault, busy, notice, true);
                }
            }
            Err(error) => {
                notice.set(Some(error));
                storage_ready.set(true);
            }
        }
    });

    set_interval(
        move || persist_and_sync(vault, busy, notice, false),
        Duration::from_secs(5),
    );

    let observations = Memo::new(move |_| vault.get().observations().unwrap_or_default());
    let charts = Memo::new(move |_| build_charts(&observations.get()));
    let can_record = Memo::new(move |_| {
        let current = vault.get();
        storage_ready.get()
            && !busy.get()
            && (current.account.is_none()
                || (current.active_session()
                    && current.account.as_ref().is_some_and(|account| {
                        account.recovery_code_pending_acknowledgement.is_none()
                    })))
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

    let recover_account = move |_| {
        if busy.get_untracked() {
            return;
        }
        let entered_password = password.get_untracked();
        if entered_password != password_confirmation.get_untracked() {
            notice.set(Some("The new passwords do not match".to_owned()));
            return;
        }
        let entered_email = email.get_untracked();
        let entered_recovery_code = recovery_code.get_untracked();
        password.set(String::new());
        password_confirmation.set(String::new());
        recovery_code.set(String::new());
        busy.set(true);
        notice.set(Some(
            "Recovering the encrypted account and replacing old devices…".to_owned(),
        ));
        let current = vault.get_untracked();
        spawn_local(async move {
            match account::recover(
                current,
                entered_email,
                entered_recovery_code,
                entered_password,
            )
            .await
            {
                Ok(recovered) => {
                    vault.set(recovered);
                    notice.set(Some(
                        "Account recovered. Store the new recovery code; old sessions and devices were revoked."
                            .to_owned(),
                    ));
                }
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
        persist_and_sync(vault, busy, notice, true);
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

    let save_supplemental = move |_| {
        if !can_record.get_untracked() {
            notice.set(Some(
                "Sign in again before recording synchronized data".to_owned(),
            ));
            return;
        }
        let result = parse_record_date(&date.get_untracked()).and_then(|record_date| {
            supplemental_observation(
                record_date,
                &supplemental_kind.get_untracked(),
                &supplemental_primary.get_untracked(),
                &supplemental_secondary.get_untracked(),
                supplemental_flag.get_untracked(),
                &vault.get_untracked(),
            )
        });
        record_and_sync(
            result,
            vault,
            busy,
            notice,
            "Observation encrypted and saved",
        );
    };

    let sync_now = move |_| persist_and_sync(vault, busy, notice, true);

    let delete_observation = move |record_key: verelle_core::RecordKey| {
        if !can_record.get_untracked() {
            notice.set(Some(
                "Sign in again before deleting synchronized data".to_owned(),
            ));
            return;
        }
        let mut current = vault.get_untracked();
        let result = current.delete_observation(record_key, web_version(&current));
        match result {
            Ok(()) => {
                vault.set(current);
                notice.set(Some(
                    "Deletion saved; ciphertext redaction queued".to_owned(),
                ));
                persist_and_sync(vault, busy, notice, true);
            }
            Err(error) => notice.set(Some(error)),
        }
    };

    let export_json = move |_| {
        let current = vault.get_untracked();
        match current.export_json().and_then(|contents| {
            encrypted_storage::download(
                &format!("verelle-chart-{}.json", today()),
                "application/json;charset=utf-8",
                &contents,
            )
        }) {
            Ok(()) => notice.set(Some(
                "Plaintext JSON export downloaded on this device".to_owned(),
            )),
            Err(error) => notice.set(Some(error)),
        }
    };

    let export_csv = move |_| {
        let current = vault.get_untracked();
        match current.export_csv().and_then(|contents| {
            encrypted_storage::download(
                &format!("verelle-chart-{}.csv", today()),
                "text/csv;charset=utf-8",
                &contents,
            )
        }) {
            Ok(()) => notice.set(Some(
                "Plaintext CSV export downloaded on this device".to_owned(),
            )),
            Err(error) => notice.set(Some(error)),
        }
    };

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

    let create_couple_invite = move |_| {
        if busy.get_untracked() {
            return;
        }
        busy.set(true);
        let current = vault.get_untracked();
        spawn_local(async move {
            match current.create_couple_invite().await {
                Ok((code, expires_at)) => {
                    generated_invite_code.set(code);
                    notice.set(Some(format!(
                        "One-use invitation created · expires at Unix time {expires_at}"
                    )));
                }
                Err(error) => notice.set(Some(error)),
            }
            busy.set(false);
        });
    };

    let accept_couple_invite = move |_| {
        if busy.get_untracked() {
            return;
        }
        let code = couple_invite_code.get_untracked();
        busy.set(true);
        let mut current = vault.get_untracked();
        spawn_local(async move {
            match current.accept_couple_invite(code).await {
                Ok(()) => {
                    couple_invite_code.set(String::new());
                    vault.set(current);
                    notice.set(Some(
                        "Shared chart accepted; encrypted sync is ready".to_owned(),
                    ));
                    busy.set(false);
                    persist_and_sync(vault, busy, notice, true);
                }
                Err(error) => {
                    vault.set(current);
                    notice.set(Some(error));
                    busy.set(false);
                }
            }
        });
    };

    let unlink_partner = move |_| {
        if busy.get_untracked()
            || !web_sys::window()
                .and_then(|window| window.confirm_with_message("Unlink your partner now? Their existing downloaded history cannot be erased, but their server access will be revoked and future entries will use a new encryption key.").ok())
                .unwrap_or(false)
        {
            return;
        }
        busy.set(true);
        let mut current = vault.get_untracked();
        spawn_local(async move {
            match current.unlink_partner().await {
                Ok(()) => {
                    vault.set(current);
                    notice.set(Some(
                        "Partner unlinked; sessions revoked and chart key advanced".to_owned(),
                    ));
                }
                Err(error) => {
                    vault.set(current);
                    notice.set(Some(error));
                }
            }
            busy.set(false);
        });
    };

    let checkout_monthly = move |_| {
        begin_checkout(vault, busy, notice, verelle_api::BillingInterval::Monthly);
    };
    let checkout_annual = move |_| {
        begin_checkout(vault, busy, notice, verelle_api::BillingInterval::Annual);
    };
    let refresh_entitlement = move |_| {
        if busy.get_untracked() {
            return;
        }
        busy.set(true);
        let current = vault.get_untracked();
        spawn_local(async move {
            match current.entitlement().await {
                Ok(entitlement) => {
                    entitlement_status.set(if entitlement.sync_allowed {
                        format!("{} · sync available", entitlement.status)
                    } else {
                        format!("{} · local use only", entitlement.status)
                    });
                    notice.set(Some("Subscription status refreshed".to_owned()));
                }
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
                    <Show when=move || !vault.get().active_session()>
                        <a
                            class="quiet-button"
                            href="#account"
                            on:click=move |_| auth_entry_mode.set(AuthEntryMode::SignIn)
                        >"Sign in"</a>
                    </Show>
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

                <Show
                    when=move || storage_ready.get()
                    fallback=move || view! { <section class="account-panel"><p class="form-note">"Opening this browser’s encrypted account…"</p></section> }
                >
                    <AuthPanel
                        vault=vault
                        busy=busy
                        email=email
                        password=password
                        password_confirmation=password_confirmation
                        health_consent=health_consent
                        recovery_acknowledged=recovery_acknowledged
                        recovery_code=recovery_code
                        auth_entry_mode=auth_entry_mode
                        notice=notice
                        register=Callback::new(register)
                        sign_in=Callback::new(sign_in)
                        recover_account=Callback::new(recover_account)
                        acknowledge_recovery=Callback::new(acknowledge_recovery)
                    />
                </Show>

                <div class=move || if can_record.get() { "safety-banner ready" } else { "safety-banner" } role="note">
                    <strong>{move || if can_record.get() { if vault.get().account.is_none() { "Private local mode." } else { "Encrypted account mode." } } else { "Recording locked." }}</strong>
                    {move || if can_record.get() {
                        if vault.get().account.is_none() {
                            " Entries stay encrypted in this browser until you clear them. An account is optional and adds multi-device sync."
                        } else {
                            " Verelle records and displays facts only; it does not provide medical or fertility guidance."
                        }
                    } else {
                        " Sign in and save the recovery code before entering synchronized health data."
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
                        <fieldset class="supplemental-entry" disabled=move || !can_record.get()>
                            <legend>"Other observation"</legend>
                            <label class="field">
                                <span>"Type"</span>
                                <select prop:value=move || supplemental_kind.get() on:change=move |event| { let kind = event_target_value(&event); let (primary, secondary) = supplemental_defaults(&kind); supplemental_kind.set(kind); supplemental_primary.set(primary); supplemental_secondary.set(secondary); supplemental_flag.set(false); }>
                                    <option value="bleeding">"Bleeding"</option>
                                    <option value="mucus">"Mucus category"</option>
                                    <option value="lh_strip">"LH strip"</option>
                                    <option value="hormones">"Quantitative hormones"</option>
                                    <option value="temperature">"Temperature"</option>
                                    <option value="intercourse">"Intercourse"</option>
                                    <option value="monitor_setup">"Monitor setup"</option>
                                    <option value="peak">"Mark Peak"</option>
                                    <option value="note">"Note"</option>
                                </select>
                            </label>
                            {move || supplemental_fields(supplemental_kind.get(), supplemental_primary, supplemental_secondary, supplemental_flag)}
                            <button class="secondary-button" type="button" on:click=save_supplemental>"Save observation"</button>
                        </fieldset>
                        {move || notice.get().map(|message| view! { <p class="notice" role="status">{message}</p> })}
                        <div class="local-facts">
                            <div><span>"Saved facts"</span><strong>{move || observations.get().len()}</strong></div>
                            <div><span>"Cloud sync"</span><strong>{move || sync_status(&vault.get(), busy.get())}</strong></div>
                            <div><span>"Last synced"</span><strong>{move || vault.get().last_synced_at.unwrap_or_else(|| "Never".to_owned())}</strong></div>
                        </div>
                        <Show when=move || !observations.get().is_empty()>
                            <div class="recent-entries">
                                <h3>"Recorded facts"</h3>
                                <For
                                    each=move || observations.get()
                                    key=|observation| observation.record_key()
                                    children=move |observation| {
                                        let record_key = observation.record_key();
                                        let label = observation_label(&observation.value);
                                        view! {
                                            <div class="recent-entry">
                                                <span><strong>{observation.date.to_string()}</strong>" · "{label}</span>
                                                <button class="quiet-button danger" type="button" on:click=move |_| delete_observation(record_key.clone()) disabled=move || busy.get()>"Delete"</button>
                                            </div>
                                        }
                                    }
                                />
                            </div>
                        </Show>
                    </aside>

                    <section class="chart-panel">
                        <div class="chart-toolbar">
                            <div class="section-heading"><span class="step-number">"02"</span><div><p class="eyebrow">"Review"</p><h2>"Cycle chart"</h2></div></div>
                            <div class="legend" aria-label="Chart legend"><span><i class="legend-dot low"></i>"Low"</span><span><i class="legend-dot high"></i>"High"</span><span><i class="legend-dot peak"></i>"Peak"</span></div>
                        </div>
                        {move || chart_meta(&charts.get())}
                        <div class="chart-days">
                            <For each=move || charts.get().last().map(|chart| chart.days.clone()).unwrap_or_default() key=|day| format!("{}:{}", day.date, day.observations.iter().map(|observation| observation.id.to_string()).collect::<Vec<_>>().join(",")) children=chart_day />
                            <Show when=move || charts.get().is_empty() fallback=|| ()>
                                <div class="empty-state"><div class="empty-orbit" aria-hidden="true"><span></span></div><h3>"Your chart starts here"</h3><p>"Create an account, store the recovery code, then record a cycle start and daily observations."</p></div>
                            </Show>
                        </div>
                    </section>
                </section>

                <Show when=move || vault.get().active_session()>
                    <section class="danger-zone billing-zone">
                        <h2>"Optional encrypted sync subscription"</h2>
                        <p>"Local charting and export remain free. A subscription funds encrypted multi-device sync and shared charts. Stripe hosts checkout; Verelle never receives card details."</p>
                        <div class="billing-actions">
                            <button class="quiet-button" type="button" on:click=checkout_monthly disabled=move || busy.get()>"$4.99 monthly"</button>
                            <button class="quiet-button" type="button" on:click=checkout_annual disabled=move || busy.get()>"$39.99 annually"</button>
                            <button class="quiet-button" type="button" on:click=refresh_entitlement disabled=move || busy.get()>"Refresh status"</button>
                            <strong>{move || entitlement_status.get()}</strong>
                        </div>
                    </section>
                    <section class="danger-zone couple-zone">
                        <h2>"Share one chart with your partner"</h2>
                        <p>"Invitations contain the client-encrypted chart key, expire after 15 minutes, and work once. Send a code through a private channel. Accepting is allowed only while this account’s chart is empty."</p>
                        <div class="couple-actions">
                            <div>
                                <button class="quiet-button" type="button" on:click=create_couple_invite disabled=move || busy.get()>"Create invitation"</button>
                                <Show when=move || !generated_invite_code.get().is_empty()>
                                    <code class="invite-code">{move || generated_invite_code.get()}</code>
                                </Show>
                            </div>
                            <div>
                                <label class="field"><span>"Invitation code"</span><textarea autocomplete="off" prop:value=move || couple_invite_code.get() on:input=move |event| couple_invite_code.set(event_target_value(&event))></textarea></label>
                                <button class="quiet-button" type="button" on:click=accept_couple_invite disabled=move || busy.get() || couple_invite_code.get().trim().is_empty()>"Accept shared chart"</button>
                            </div>
                            <div>
                                <p>"Unlinking immediately revokes the other account’s server sessions and advances the chart key. Copies already downloaded to another device cannot be erased remotely."</p>
                                <button class="danger-button" type="button" on:click=unlink_partner disabled=move || busy.get()>"Unlink partner"</button>
                            </div>
                        </div>
                    </section>
                    <section class="danger-zone export-zone">
                        <h2>"Export your chart"</h2>
                        <p>"Exports are decrypted in this browser and downloaded as plaintext. Store or share them only where you intend."</p>
                        <div class="topbar-actions">
                            <button class="quiet-button" type="button" on:click=export_json disabled=move || busy.get()>"Download JSON"</button>
                            <button class="quiet-button" type="button" on:click=export_csv disabled=move || busy.get()>"Download CSV"</button>
                        </div>
                    </section>
                    <section class="danger-zone">
                        <h2>"Delete account and chart"</h2>
                        <p>"This permanently deletes the account and encrypted server chart. It cannot be undone. Download an export first if you need a copy."</p>
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
    recovery_code: RwSignal<String>,
    auth_entry_mode: RwSignal<AuthEntryMode>,
    notice: RwSignal<Option<String>>,
    register: Callback<leptos::ev::MouseEvent>,
    sign_in: Callback<leptos::ev::MouseEvent>,
    recover_account: Callback<leptos::ev::MouseEvent>,
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
        <section class="account-panel" id="account">
            <Show when=move || vault.get().account.is_none()>
                <div class="auth-entry-shell">
                    <nav class="auth-entry-tabs" aria-label="Account access">
                        <button
                            class=move || auth_entry_tab_class(auth_entry_mode.get() == AuthEntryMode::Create)
                            type="button"
                            aria-pressed=move || auth_entry_mode.get() == AuthEntryMode::Create
                            on:click=move |_| auth_entry_mode.set(AuthEntryMode::Create)
                        >"Create account"</button>
                        <button
                            class=move || auth_entry_tab_class(auth_entry_mode.get() == AuthEntryMode::SignIn)
                            type="button"
                            aria-pressed=move || auth_entry_mode.get() == AuthEntryMode::SignIn
                            on:click=move |_| auth_entry_mode.set(AuthEntryMode::SignIn)
                        >"Sign in"</button>
                        <button
                            class=move || auth_entry_tab_class(auth_entry_mode.get() == AuthEntryMode::Recover)
                            type="button"
                            aria-pressed=move || auth_entry_mode.get() == AuthEntryMode::Recover
                            on:click=move |_| auth_entry_mode.set(AuthEntryMode::Recover)
                        >"Recover account"</button>
                    </nav>

                    <Show when=move || auth_entry_mode.get() == AuthEntryMode::Create>
                        <div class="auth-entry-content" id="create-account-panel">
                            <div class="auth-entry-intro"><p class="eyebrow">"Private account"</p><h2>"Create your encrypted chart"</h2><p>"Your password is processed with OPAQUE and is never sent to Verelle. This browser creates a non-exportable device signing key."</p></div>
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
                        </div>
                    </Show>

                    <Show when=move || auth_entry_mode.get() == AuthEntryMode::SignIn>
                        <div class="auth-entry-content" id="sign-in-panel">
                            <div class="auth-entry-intro"><p class="eyebrow">"Welcome back"</p><h2>"Sign in to Verelle"</h2><p>"Verelle requires both your password and this browser’s enrolled private device key. The device key never leaves the browser."</p></div>
                            <div class="account-form auth-choice">
                                <strong>"No enrollment was found in this browser"</strong>
                                <p>"If you previously signed in here, make sure you are using the same browser profile and have not cleared its site data. A password alone cannot enroll a new browser."</p>
                                <p>"To use an existing account on this browser, recover it with the offline recovery code. Recovery securely enrolls this browser, replaces the password, and revokes old devices and sessions."</p>
                                <div class="auth-choice-actions">
                                    <button class="primary-button" type="button" on:click=move |_| auth_entry_mode.set(AuthEntryMode::Recover)><span>"Use recovery code"</span><span>"→"</span></button>
                                    <button class="quiet-button" type="button" on:click=move |_| auth_entry_mode.set(AuthEntryMode::Create)>"Create a new account"</button>
                                </div>
                            </div>
                        </div>
                    </Show>

                    <Show when=move || auth_entry_mode.get() == AuthEntryMode::Recover>
                        <div class="auth-entry-content" id="recover-account-panel">
                            <div class="auth-entry-intro"><p class="eyebrow">"New or cleared browser"</p><h2>"Recover and enroll this browser"</h2><p>"Use the recovery code you stored offline. Recovery replaces your password, revokes every old session and device, and issues a new one-time recovery code."</p></div>
                            <div class="account-form">
                                <label class="field"><span>"Account email"</span><input type="email" autocomplete="email" prop:value=move || email.get() on:input=move |event| email.set(event_target_value(&event))/></label>
                                <label class="field"><span>"Recovery code"</span><input type="password" autocomplete="off" prop:value=move || recovery_code.get() on:input=move |event| recovery_code.set(event_target_value(&event))/></label>
                                <label class="field"><span>"New password (12+ characters)"</span><input type="password" autocomplete="new-password" prop:value=move || password.get() on:input=move |event| password.set(event_target_value(&event))/></label>
                                <label class="field"><span>"Confirm new password"</span><input type="password" autocomplete="new-password" prop:value=move || password_confirmation.get() on:input=move |event| password_confirmation.set(event_target_value(&event))/></label>
                                <button class="primary-button" type="button" on:click=move |event| recover_account.run(event) disabled=move || busy.get()><span>"Recover and enroll browser"</span><span>"→"</span></button>
                                <p class="form-note">"This is the only supported way to move your account to a new browser today. Keep the replacement recovery code offline after recovery completes."</p>
                            </div>
                        </div>
                    </Show>
                </div>
            </Show>

            <Show when=move || vault.get().account.is_some() && !vault.get().active_session()>
                <div><p class="eyebrow">"Welcome back"</p><h2>"Sign in on this enrolled browser"</h2><p>"OPAQUE verifies the password; a P-256 device signature proves this browser still holds the enrolled private key."</p></div>
                <div class="account-form">
                    <label class="field"><span>"Enrolled email"</span><input type="email" prop:value=move || email.get() readonly/></label>
                    <label class="field"><span>"Password"</span><input type="password" autocomplete="current-password" prop:value=move || password.get() on:input=move |event| password.set(event_target_value(&event))/></label>
                    <button class="primary-button" type="button" on:click=move |event| sign_in.run(event) disabled=move || busy.get()><span>"Sign in"</span><span>"→"</span></button>
                    <p class="form-note">"If this device is lost, use the offline recovery code on a new browser to replace the password and revoke every old session and device."</p>
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

fn begin_checkout(
    vault: RwSignal<BrowserVault>,
    busy: RwSignal<bool>,
    notice: RwSignal<Option<String>>,
    interval: verelle_api::BillingInterval,
) {
    if busy.get_untracked() {
        return;
    }
    busy.set(true);
    let current = vault.get_untracked();
    spawn_local(async move {
        match current.create_checkout(interval).await {
            Ok(url) => {
                if web_sys::window()
                    .and_then(|window| window.location().set_href(&url).ok())
                    .is_none()
                {
                    notice.set(Some("Stripe Checkout could not be opened".to_owned()));
                    busy.set(false);
                }
            }
            Err(error) => {
                notice.set(Some(error));
                busy.set(false);
            }
        }
    });
}

fn supplemental_fields(
    kind: String,
    primary: RwSignal<String>,
    secondary: RwSignal<String>,
    flag: RwSignal<bool>,
) -> AnyView {
    match kind.as_str() {
        "bleeding" => view! {
            <label class="field"><span>"Intensity"</span><select prop:value=move || primary.get() on:change=move |event| primary.set(event_target_value(&event))><option value="spotting">"Spotting"</option><option value="light">"Light"</option><option value="moderate">"Moderate"</option><option value="heavy">"Heavy"</option></select></label>
        }.into_any(),
        "mucus" => view! {
            <label class="field"><span>"Recorded category"</span><select prop:value=move || primary.get() on:change=move |event| primary.set(event_target_value(&event))><option value="low">"Low"</option><option value="high">"High"</option><option value="peak">"Peak"</option></select></label>
        }.into_any(),
        "lh_strip" => view! {
            <label class="field"><span>"Result"</span><select prop:value=move || primary.get() on:change=move |event| primary.set(event_target_value(&event))><option value="negative">"Negative"</option><option value="positive">"Positive"</option><option value="invalid">"Invalid"</option><option value="indeterminate">"Indeterminate"</option></select></label>
            <label class="field"><span>"T/C ratio (optional)"</span><input type="number" min="0" step="0.01" prop:value=move || secondary.get() on:input=move |event| secondary.set(event_target_value(&event))/></label>
        }.into_any(),
        "hormones" => view! {
            <label class="field"><span>"E3G (optional)"</span><input type="number" min="0" step="0.01" prop:value=move || primary.get() on:input=move |event| primary.set(event_target_value(&event))/></label>
            <label class="field"><span>"LH (optional)"</span><input type="number" min="0" step="0.01" prop:value=move || secondary.get() on:input=move |event| secondary.set(event_target_value(&event))/></label>
        }.into_any(),
        "temperature" => view! {
            <label class="field"><span>"Temperature"</span><input type="number" step="0.01" prop:value=move || primary.get() on:input=move |event| primary.set(event_target_value(&event))/></label>
            <label class="field"><span>"Unit"</span><select prop:value=move || secondary.get() on:change=move |event| secondary.set(event_target_value(&event))><option value="fahrenheit">"°F"</option><option value="celsius">"°C"</option></select></label>
            <label class="consent"><input type="checkbox" prop:checked=move || flag.get() on:change=move |event| flag.set(event_target_checked(&event))/><span>"Sleep was disturbed"</span></label>
        }.into_any(),
        "intercourse" => view! {
            <label class="field"><span>"Entry"</span><select prop:value=move || primary.get() on:change=move |event| primary.set(event_target_value(&event))><option value="intercourse">"Intercourse"</option><option value="genital_contact">"Genital contact"</option><option value="withdrawal">"Withdrawal"</option></select></label>
            <label class="consent"><input type="checkbox" prop:checked=move || flag.get() on:change=move |event| flag.set(event_target_checked(&event))/><span>"Protected"</span></label>
        }.into_any(),
        "monitor_setup" => view! {
            <label class="field"><span>"M-button time"</span><input type="time" prop:value=move || primary.get() on:input=move |event| primary.set(event_target_value(&event))/></label>
            <label class="field"><span>"Monitor model (optional)"</span><input type="text" maxlength="80" prop:value=move || secondary.get() on:input=move |event| secondary.set(event_target_value(&event))/></label>
            <label class="consent"><input type="checkbox" prop:checked=move || flag.get() on:change=move |event| flag.set(event_target_checked(&event))/><span>"Memory reset"</span></label>
        }.into_any(),
        "peak" => view! {
            <label class="field"><span>"Source"</span><select prop:value=move || primary.get() on:change=move |event| primary.set(event_target_value(&event))><option value="monitor">"Monitor"</option><option value="mucus">"Mucus"</option><option value="lh_strip">"LH strip"</option><option value="other">"Other"</option></select></label>
        }.into_any(),
        "note" => view! {
            <label class="field"><span>"Private note"</span><textarea maxlength="2000" prop:value=move || primary.get() on:input=move |event| primary.set(event_target_value(&event))></textarea></label>
        }.into_any(),
        _ => view! { <p class="form-note">"Choose an observation type."</p> }.into_any(),
    }
}

fn supplemental_defaults(kind: &str) -> (String, String) {
    match kind {
        "bleeding" => ("spotting".to_owned(), String::new()),
        "mucus" => ("low".to_owned(), String::new()),
        "lh_strip" => ("negative".to_owned(), String::new()),
        "temperature" => (String::new(), "fahrenheit".to_owned()),
        "intercourse" => ("intercourse".to_owned(), String::new()),
        "monitor_setup" => ("06:00".to_owned(), String::new()),
        "peak" => ("monitor".to_owned(), String::new()),
        _ => (String::new(), String::new()),
    }
}

fn supplemental_observation(
    date: NaiveDate,
    kind: &str,
    primary: &str,
    secondary: &str,
    flag: bool,
    vault: &BrowserVault,
) -> Result<Observation, String> {
    let trimmed_primary = primary.trim();
    let value = match kind {
        "bleeding" => ObservationValue::Bleeding {
            intensity: match trimmed_primary {
                "heavy" => BleedingIntensity::Heavy,
                "moderate" => BleedingIntensity::Moderate,
                "light" => BleedingIntensity::Light,
                _ => BleedingIntensity::Spotting,
            },
        },
        "mucus" => ObservationValue::Mucus {
            sensation: None,
            appearance: None,
            category: Some(match trimmed_primary {
                "high" => MucusCategory::High,
                "peak" => MucusCategory::Peak,
                _ => MucusCategory::Low,
            }),
            baseline_change: None,
            confidence: None,
        },
        "lh_strip" => ObservationValue::LhStrip {
            brand: None,
            qualitative: match trimmed_primary {
                "positive" => LhQualitative::Positive,
                "invalid" => LhQualitative::Invalid,
                "indeterminate" => LhQualitative::Indeterminate,
                _ => LhQualitative::Negative,
            },
            tc_ratio: optional_non_negative(secondary, "T/C ratio")?,
            numeric_lh: None,
            valid: trimmed_primary != "invalid",
            test_time: None,
        },
        "hormones" => {
            let e3g = optional_non_negative(primary, "E3G")?;
            let lh = optional_non_negative(secondary, "LH")?;
            if e3g.is_none() && lh.is_none() {
                return Err("Enter E3G, LH, or both".to_owned());
            }
            ObservationValue::QuantitativeHormones {
                e3g,
                lh,
                e3g_unit: e3g.map(|_| "ng/mL".to_owned()),
                lh_unit: lh.map(|_| "mIU/mL".to_owned()),
            }
        }
        "temperature" => ObservationValue::Temperature {
            value: required_number(primary, "temperature")?,
            unit: if secondary.trim() == "celsius" {
                TemperatureUnit::Celsius
            } else {
                TemperatureUnit::Fahrenheit
            },
            time: None,
            sleep_quality: None,
            disturbed: flag,
        },
        "intercourse" => ObservationValue::Intercourse {
            kind: match trimmed_primary {
                "genital_contact" => IntercourseKind::GenitalContact,
                "withdrawal" => IntercourseKind::Withdrawal,
                _ => IntercourseKind::Intercourse,
            },
            protected: Some(flag),
        },
        "monitor_setup" => ObservationValue::MonitorSetup {
            m_button_time: NaiveTime::parse_from_str(trimmed_primary, "%H:%M")
                .map_err(|_| "Enter the M-button time".to_owned())?,
            monitor_model: nonempty(secondary),
            memory_reset: flag,
            artificial_cycle_id: None,
        },
        "peak" => ObservationValue::UserMarkedPeak {
            source: match trimmed_primary {
                "mucus" => PeakSource::Mucus,
                "lh_strip" => PeakSource::LhStrip,
                "other" => PeakSource::Other,
                _ => PeakSource::Monitor,
            },
        },
        "note" => {
            if trimmed_primary.is_empty() {
                return Err("Enter a note".to_owned());
            }
            ObservationValue::Note {
                text: trimmed_primary.to_owned(),
            }
        }
        _ => return Err("Choose a supported observation type".to_owned()),
    };
    let observation = Observation {
        id: Uuid::new_v4(),
        date,
        value,
        recorded_by: current_device_id(vault),
        version: web_version(vault),
    };
    observation
        .validate()
        .map_err(|error| format!("The observation is invalid: {error}"))?;
    Ok(observation)
}

fn optional_non_negative(value: &str, label: &str) -> Result<Option<f64>, String> {
    if value.trim().is_empty() {
        return Ok(None);
    }
    let number = required_number(value, label)?;
    if number < 0.0 {
        return Err(format!("{label} cannot be negative"));
    }
    Ok(Some(number))
}

fn required_number(value: &str, label: &str) -> Result<f64, String> {
    value
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|number| number.is_finite())
        .ok_or_else(|| format!("Enter a valid {label}"))
}

fn nonempty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
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
            persist_and_sync(vault, busy, notice, true);
        }
        Err(error) => notice.set(Some(error)),
    }
}

fn persist_and_sync(
    vault: RwSignal<BrowserVault>,
    busy: RwSignal<bool>,
    notice: RwSignal<Option<String>>,
    announce: bool,
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
                // Commit the acknowledged outbox before server-side ciphertext
                // redaction so a crash cannot replay an operation whose body is gone.
                account::save_vault(&current).await?;
                current.finish_pending_redactions().await?;
                current.last_synced_at = Date::new_0().to_iso_string().as_string();
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
                if announce {
                    notice.set(Some(format!(
                        "Encrypted sync complete · {} pushed · {} pulled",
                        summary.pushed, summary.pulled
                    )));
                }
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

fn auth_entry_tab_class(selected: bool) -> &'static str {
    if selected {
        "auth-entry-tab selected"
    } else {
        "auth-entry-tab"
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
