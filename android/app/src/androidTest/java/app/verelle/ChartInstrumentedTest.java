package app.verelle;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented test, which will execute on an Android device.
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
@RunWith(AndroidJUnit4.class)
public class ChartInstrumentedTest {

    private static final long LAUNCH_TIMEOUT_MS = 20_000;
    private static final long SYNC_TIMEOUT_MS = 60_000;

    @Test
    public void chartPaintsInAndroidWebView() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device = launchAndWaitForChart(appContext, null);
        device.findObject(By.text("Error")).click();
        device.findObject(By.text("Save")).click();
        assertTrue(
            "The saved Monitor reading never appeared in the Android Chart",
            device.wait(
                Until.hasObject(By.textContains("Monitor reading Error")),
                LAUNCH_TIMEOUT_MS
            )
        );
    }

    @Test
    public void receivesObservationRecordedOnIos() {
        String sharedOwner = InstrumentationRegistry.getArguments().getString("sharedOwner");
        String expectedWords = InstrumentationRegistry.getArguments().getString(
            "expectedWords"
        );
        Assume.assumeTrue(
            "Run through scripts/cross-platform-sync-smoke.sh",
            sharedOwner != null && expectedWords != null
        );

        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device = launchAndWaitForChart(appContext, sharedOwner);
        device.findObject(By.text("Backup & restore")).click();
        for (String word : expectedWords.split(",")) {
            assertTrue(
                "Android did not install the interim Shared owner",
                device.wait(Until.hasObject(By.text(word)), LAUNCH_TIMEOUT_MS)
            );
        }
        device.findObject(By.text("Back to Chart")).click();
        assertTrue(
            "The iOS Observation never converged onto Android",
            device.wait(
                Until.hasObject(By.textContains("Monitor reading Error")),
                SYNC_TIMEOUT_MS
            )
        );
        assertTrue(
            "Android never reported the shared Chart as synced",
            device.wait(Until.hasObject(By.text("Synced")), LAUNCH_TIMEOUT_MS)
        );
    }

    private UiDevice launchAndWaitForChart(Context appContext, String sharedOwner) {
        Intent launch = appContext.getPackageManager().getLaunchIntentForPackage("app.verelle");
        assertNotNull("Verelle has no launch Activity", launch);
        if (sharedOwner != null) {
            launch.putExtra("app.verelle.INTERIM_SHARED_OWNER", sharedOwner);
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
        appContext.startActivity(launch);

        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        assertTrue(
            "The Chart never painted in the Android WebView",
            device.wait(Until.hasObject(By.text("Chart")), LAUNCH_TIMEOUT_MS)
        );
        return device;
    }
}
