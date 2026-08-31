package app.verelle;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;
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

    @Test
    public void chartPaintsInAndroidWebView() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device = launchAndWaitForChart(appContext);
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

    private UiDevice launchAndWaitForChart(Context appContext) {
        Intent launch = appContext.getPackageManager().getLaunchIntentForPackage("app.verelle");
        assertNotNull("Verelle has no launch Activity", launch);
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
