package app.verelle;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.ByteBuffer;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "OwnerSecrets")
public final class OwnerSecretsPlugin extends Plugin {

    private static final String ANDROID_KEY_STORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "app.verelle.owner-secrets";
    private static final String PREFERENCES = "verelle_owner_secrets";
    private static final String INTERIM_SHARED_OWNER = "app.verelle.INTERIM_SHARED_OWNER";
    private static final int OWNER_SECRET_BYTES = 32;
    private static final int GCM_TAG_BITS = 128;

    private enum OwnerSecretKey {
        DEVICE("deviceOwner"),
        SHARED("sharedOwner");

        private final String storageName;

        OwnerSecretKey(String storageName) {
            this.storageName = storageName;
        }
    }

    @PluginMethod
    public void loadOrCreate(PluginCall call) {
        try {
            byte[] deviceOwner = loadOrCreate(OwnerSecretKey.DEVICE);
            byte[] sharedOwner = loadOrCreate(OwnerSecretKey.SHARED);
            byte[] interim = interimSharedOwner();
            if (interim != null) {
                save(OwnerSecretKey.SHARED, interim);
                sharedOwner = interim;
            }
            JSObject result = new JSObject();
            result.put(
                OwnerSecretKey.DEVICE.storageName,
                Base64.encodeToString(deviceOwner, Base64.NO_WRAP)
            );
            result.put(
                OwnerSecretKey.SHARED.storageName,
                Base64.encodeToString(sharedOwner, Base64.NO_WRAP)
            );
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Owner secrets are unavailable.", "KEYSTORE_ERROR");
        }
    }

    /**
     * INTERIM (#13): the cross-platform acceptance harness gives both debug
     * apps one runtime-generated Shared owner. This is not product Pairing,
     * cannot run in release builds, and is deleted when #14 lands.
     */
    private byte[] interimSharedOwner() {
        boolean debuggable = (getContext().getApplicationInfo().flags
            & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (!debuggable || getActivity() == null) return null;
        String encoded = getActivity().getIntent().getStringExtra(INTERIM_SHARED_OWNER);
        if (encoded == null) return null;
        byte[] secret = Base64.decode(encoded, Base64.NO_WRAP);
        if (secret.length != OWNER_SECRET_BYTES) {
            throw new IllegalArgumentException("The interim Shared owner is invalid");
        }
        return secret;
    }

    @PluginMethod
    public void replaceSharedOwner(PluginCall call) {
        String encoded = call.getString(OwnerSecretKey.SHARED.storageName);
        if (encoded == null) {
            call.reject("The Shared owner is invalid.", "INVALID_OWNER");
            return;
        }

        try {
            byte[] secret = Base64.decode(encoded, Base64.NO_WRAP);
            if (secret.length != OWNER_SECRET_BYTES) {
                call.reject("The Shared owner is invalid.", "INVALID_OWNER");
                return;
            }
            save(OwnerSecretKey.SHARED, secret);
            call.resolve();
        } catch (Exception error) {
            call.reject("The Shared owner could not be saved.", "KEYSTORE_ERROR");
        }
    }

    private byte[] loadOrCreate(OwnerSecretKey key) throws Exception {
        SharedPreferences preferences = preferences();
        String encrypted = preferences.getString(key.storageName, null);
        if (encrypted != null) return decrypt(encrypted);

        byte[] secret = new byte[OWNER_SECRET_BYTES];
        new SecureRandom().nextBytes(secret);
        save(key, secret);
        return secret;
    }

    private void save(OwnerSecretKey key, byte[] secret) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] ciphertext = cipher.doFinal(secret);
        byte[] iv = cipher.getIV();
        ByteBuffer record = ByteBuffer.allocate(Integer.BYTES + iv.length + ciphertext.length);
        record.putInt(iv.length);
        record.put(iv);
        record.put(ciphertext);
        boolean saved = preferences()
            .edit()
            .putString(key.storageName, Base64.encodeToString(record.array(), Base64.NO_WRAP))
            .commit();
        if (!saved) throw new IllegalStateException("Encrypted owner storage failed");
    }

    private byte[] decrypt(String encoded) throws Exception {
        ByteBuffer record = ByteBuffer.wrap(Base64.decode(encoded, Base64.NO_WRAP));
        int ivLength = record.getInt();
        if (ivLength <= 0 || ivLength > record.remaining()) {
            throw new IllegalStateException("Encrypted owner storage is invalid");
        }
        byte[] iv = new byte[ivLength];
        record.get(iv);
        byte[] ciphertext = new byte[record.remaining()];
        record.get(ciphertext);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] secret = cipher.doFinal(ciphertext);
        if (secret.length != OWNER_SECRET_BYTES) {
            throw new IllegalStateException("Encrypted owner storage is invalid");
        }
        return secret;
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEY_STORE);
        keyStore.load(null);
        KeyStore.Entry existing = keyStore.getEntry(KEY_ALIAS, null);
        if (existing instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) existing).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEY_STORE
        );
        generator.init(
            new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        );
        return generator.generateKey();
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }
}
