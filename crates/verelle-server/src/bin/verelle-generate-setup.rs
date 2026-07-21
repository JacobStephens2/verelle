use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};

fn main() {
    let setup = verelle_auth::generate_server_setup();
    print!("{}", URL_SAFE_NO_PAD.encode(setup));
}
