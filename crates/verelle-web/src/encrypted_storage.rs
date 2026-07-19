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

    #[wasm_bindgen(catch, js_name = devicePublicKey)]
    fn device_public_key() -> Result<Promise, JsValue>;

    #[wasm_bindgen(catch, js_name = signDeviceMessage)]
    fn sign_device_message(value: &str) -> Result<Promise, JsValue>;

    #[wasm_bindgen(catch, js_name = destroyBrowserVault)]
    fn destroy_browser_vault() -> Result<Promise, JsValue>;

    #[wasm_bindgen(catch, js_name = downloadPlaintextFile)]
    fn download_plaintext_file(
        filename: &str,
        media_type: &str,
        contents: &str,
    ) -> Result<(), JsValue>;
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

pub async fn public_device_key() -> Result<String, String> {
    JsFuture::from(
        device_public_key().map_err(|_| "Browser device identity is unavailable".to_owned())?,
    )
    .await
    .map_err(|_| "Browser device identity could not be loaded".to_owned())?
    .as_string()
    .ok_or_else(|| "Browser device identity is invalid".to_owned())
}

pub async fn sign_device(message_base64url: &str) -> Result<String, String> {
    JsFuture::from(
        sign_device_message(message_base64url)
            .map_err(|_| "Browser device signing is unavailable".to_owned())?,
    )
    .await
    .map_err(|_| "Browser device signing failed".to_owned())?
    .as_string()
    .ok_or_else(|| "Browser device signature is invalid".to_owned())
}

pub async fn destroy() -> Result<(), String> {
    JsFuture::from(
        destroy_browser_vault().map_err(|_| "Browser vault deletion is unavailable".to_owned())?,
    )
    .await
    .map_err(|_| "Browser vault deletion failed".to_owned())?;
    Ok(())
}

pub fn download(filename: &str, media_type: &str, contents: &str) -> Result<(), String> {
    download_plaintext_file(filename, media_type, contents)
        .map_err(|_| "The browser could not create the export download".to_owned())
}
