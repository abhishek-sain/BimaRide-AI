package expo.modules.falldetection

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS-facing control surface for the background fall-detection foreground
 * service. The heavy lifting (sensor listening, the fall-detection state
 * machine, the alert POST) all lives in FallDetectionService — this class
 * just starts/stops it and persists what it needs to survive without a
 * running JS engine (the bearer token and API base URL), since the
 * service must keep working with the app fully closed.
 */
class FallDetectionModule : Module() {
  private val prefs: SharedPreferences
    get() = appContext.reactContext!!.getSharedPreferences(FallDetectionService.PREFS_NAME, Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    Name("FallDetection")

    Function("startMonitoring") { token: String, apiBaseUrl: String ->
      val context = appContext.reactContext ?: return@Function false
      prefs.edit()
        .putString(FallDetectionService.PREF_TOKEN, token)
        .putString(FallDetectionService.PREF_API_BASE_URL, apiBaseUrl)
        .putBoolean(FallDetectionService.PREF_ENABLED, true)
        .apply()
      val intent = Intent(context, FallDetectionService::class.java)
      context.startForegroundService(intent)
      true
    }

    Function("stopMonitoring") {
      val context = appContext.reactContext ?: return@Function false
      prefs.edit().putBoolean(FallDetectionService.PREF_ENABLED, false).apply()
      context.stopService(Intent(context, FallDetectionService::class.java))
      true
    }

    Function("isMonitoring") {
      prefs.getBoolean(FallDetectionService.PREF_ENABLED, false)
    }
  }
}
