//! Browser shell and browser-independent recording helpers for Verelle.

mod model;
pub mod sync_state;

#[cfg(target_arch = "wasm32")]
pub mod sync_transport;

#[cfg(target_arch = "wasm32")]
mod account_transport;

#[cfg(target_arch = "wasm32")]
mod account;

#[cfg(target_arch = "wasm32")]
pub mod sync_runtime;

pub use model::{observation_label, upsert_observation};

#[cfg(target_arch = "wasm32")]
mod app;

#[cfg(target_arch = "wasm32")]
mod encrypted_storage;

#[cfg(target_arch = "wasm32")]
pub use app::mount;
