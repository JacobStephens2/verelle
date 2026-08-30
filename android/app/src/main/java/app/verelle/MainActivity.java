package app.verelle;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(OwnerSecretsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
