package expo.modules.falldetection

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restarts the fall-detection foreground service after a reboot, if the
 * rider had it on before — otherwise "always-on" monitoring would
 * silently stop working every time the phone restarts, which defeats the
 * point of it being always-on.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    val prefs = context.getSharedPreferences(FallDetectionService.PREFS_NAME, Context.MODE_PRIVATE)
    if (!prefs.getBoolean(FallDetectionService.PREF_ENABLED, false)) return
    if (prefs.getString(FallDetectionService.PREF_TOKEN, null) == null) return
    context.startForegroundService(Intent(context, FallDetectionService::class.java))
  }
}
