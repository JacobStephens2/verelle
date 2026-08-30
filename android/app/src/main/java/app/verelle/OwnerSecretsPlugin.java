package app.verelle;

import android.content.Context;
import android.content.SharedPreferences;
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
    private static final String DEVICE_OWNER = "deviceOwner";
    private static final String SHARED_OWNER = "sharedOwner";
    private static final int OWNER_SECRET_BYTES = 32;
    private static final int GCM_TAG_BITS = 128;

    @PluginMethod
    public void loadOrCreate(PluginCall call) {
        try {
            byte[] deviceOwner = loadOrCreate(DEVICE_OWNER);
            byte[] sharedOwner = loadOrCreate(SHARED_OWNER);
            JSObject result = new JSObject();
            result.put(DEVICE_OWNER, Base64.encodeToString(deviceOwner, Base64.NO_WRAP));
            result.put(SHARED_OWNER, Base64.encodeToString(sharedOwner, Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Owner secrets are unavailable.", "KEYSTORE_ERROR");
        }
    }

    @PluginMethod
    public void replaceSharedOwner(PluginCall call) {
        String encoded = call.getString(SHARED_OWNER);
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
            save(SHARED_OWNER, secret);
            call.resolve();
        } catch (Exception error) {
            call.reject("The Shared owner could not be saved.", "KEYSTORE_ERROR");
        }
    }

    private byte[] loadOrCreate(String name) throws Exception {
        SharedPreferences preferences = preferences();
        String encrypted = preferences.getString(name, null);
        if (encrypted != null) return decrypt(encrypted);

        byte[] secret = new byte[OWNER_SECRET_BYTES];
        new SecureRandom().nextBytes(secret);
        save(name, secret);
        return secret;
    }

    private void save(String name, byte[] secret) throws Exception {
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
            .putString(name, Base64.encodeToString(record.array(), Base64.NO_WRAP))
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
