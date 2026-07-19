use js_sys::Promise;
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};
use wasm_bindgen_futures::JsFuture;

#[wasm_bindgen(module = "/src/encrypted_storage.js")]
extern "C" {
    #[wasm_bindgen(catch, js_name = loadEncryptedState)]
    fn load_encrypted_state() -> Result<Promise, JsValue>;

    #[wasm_bindgen(catch, js_name = saveEncryptedState)]
    fn save_encrypted_state(value: &str) -> Result<Promise, JsValue>;

    #[wasm_bindgen(catch, js_name = clearEncryptedState)]
    fn clear_encrypted_state() -> Result<Promise, JsValue>;
}

pub async fn load() -> Result<Option<String>, String> {
    let value = JsFuture::from(
        load_encrypted_state()
            .map_err(|_| "Encrypted browser storage is unavailable".to_owned())?,
    )
    .await
    .map_err(|_| "Encrypted browser storage could not be unlocked".to_owned())?;
    if value.is_null() || value.is_undefined() {
        Ok(None)
    } else {
        value
            .as_string()
            .map(Some)
            .ok_or_else(|| "Encrypted browser storage returned an invalid value".to_owned())
    }
}

pub async fn save(value: &str) -> Result<(), String> {
    JsFuture::from(
        save_encrypted_state(value)
            .map_err(|_| "Encrypted browser storage is unavailable".to_owned())?,
    )
    .await
    .map_err(|_| "Encrypted browser storage could not be written".to_owned())?;
    Ok(())
}

pub async fn clear() -> Result<(), String> {
    JsFuture::from(
        clear_encrypted_state()
            .map_err(|_| "Encrypted browser storage is unavailable".to_owned())?,
    )
    .await
    .map_err(|_| "Encrypted browser storage could not be cleared".to_owned())?;
    Ok(())
}
