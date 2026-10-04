package expo.modules.falldetection

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import kotlin.math.sqrt

/**
 * Foreground service that keeps watching the raw accelerometer even with
 * the app fully closed, looking for the same free-fall-then-impact
 * signature as the JS-side detector that runs during an active ride
 * (mobile/src/services/fallDetector.ts) — this is its "always on,
 * independent of a ride" counterpart. The state machine and thresholds
 * are kept identical on purpose; change one, change both.
 *
 * Android requires any continuous background sensor/location work like
 * this to run inside a foreground service with a persistent, user-visible
 * notification — there's no way to do this invisibly, by design, since a
 * hidden always-on background process is exactly what Android's battery
 * protections exist to prevent.
 */
class FallDetectionService : Service(), SensorEventListener {

  companion object {
    const val PREFS_NAME = "fall_detection"
    const val PREF_TOKEN = "token"
    const val PREF_API_BASE_URL = "apiBaseUrl"
    const val PREF_ENABLED = "enabled"

    private const val CHANNEL_ID = "fall_detection_monitor"
    private const val NOTIFICATION_ID = 7421
    private const val SENSOR_SAMPLING_PERIOD_US = 100_000 // 100ms = 10Hz, matches the JS-side detector

    // Same thresholds as fallDetector.ts — keep both in sync.
    private const val FREE_FALL_G = 0.5
    private const val FREE_FALL_MIN_SAMPLES = 2
    private const val IMPACT_G = 2.5
    private const val IMPACT_WINDOW_MS = 1000L
    private const val COOLDOWN_MS = 10_000L
  }

  private enum class State { IDLE, FALLING, WATCHING_IMPACT }

  private lateinit var sensorManager: SensorManager
  private lateinit var fusedLocationClient: FusedLocationProviderClient
  private lateinit var prefs: SharedPreferences
  private val httpClient = OkHttpClient()
  private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

  private var state = State.IDLE
  private var freeFallSamples = 0
  private var fallEndedAt = 0L
  private var cooldownUntil = 0L

  override fun onCreate() {
    super.onCreate()
    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
    prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    if (accelerometer != null) {
      sensorManager.registerListener(this, accelerometer, SENSOR_SAMPLING_PERIOD_US)
    }

    // START_STICKY: if the OS kills this process under memory pressure,
    // it's recreated and onStartCommand runs again with a null intent —
    // acceptable here since all state it needs (token, API URL, the
    // enabled flag) lives in SharedPreferences, not the Intent extras.
    return START_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()
    sensorManager.unregisterListener(this)
    serviceScope.cancel()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return
    // Android's raw accelerometer is in m/s^2; convert to "g" to match the
    // same thresholds the JS detector uses on expo-sensors' output (which
    // is already unitless g).
    val gx = event.values[0] / SensorManager.GRAVITY_EARTH
    val gy = event.values[1] / SensorManager.GRAVITY_EARTH
    val gz = event.values[2] / SensorManager.GRAVITY_EARTH

    if (ingest(gx, gy, gz, System.currentTimeMillis())) {
      onFallDetected()
    }
  }

  /** Mirrors fallDetector.ts's FallDetector.ingest exactly — see that file
   * for the reasoning behind the two-phase free-fall/impact approach. */
  private fun ingest(x: Float, y: Float, z: Float, now: Long): Boolean {
    if (now < cooldownUntil) return false

    val magnitude = sqrt((x * x + y * y + z * z).toDouble())
    val isFreeFall = magnitude < FREE_FALL_G
    val isImpact = magnitude >= IMPACT_G

    return when (state) {
      State.IDLE -> {
        if (isFreeFall) {
          freeFallSamples = 1
          state = State.FALLING
        }
        false
      }
      State.FALLING -> {
        if (isFreeFall) {
          freeFallSamples += 1
          false
        } else if (freeFallSamples < FREE_FALL_MIN_SAMPLES) {
          state = State.IDLE
          freeFallSamples = 0
          false
        } else if (isImpact) {
          trigger(now)
          true
        } else {
          fallEndedAt = now
          state = State.WATCHING_IMPACT
          false
        }
      }
      State.WATCHING_IMPACT -> {
        if (isImpact) {
          trigger(now)
          true
        } else {
          if (now - fallEndedAt > IMPACT_WINDOW_MS) {
            state = State.IDLE
            freeFallSamples = 0
          }
          false
        }
      }
    }
  }

  private fun trigger(now: Long) {
    state = State.IDLE
    freeFallSamples = 0
    cooldownUntil = now + COOLDOWN_MS
  }

  private fun onFallDetected() {
    val token = prefs.getString(PREF_TOKEN, null) ?: return
    val apiBaseUrl = prefs.getString(PREF_API_BASE_URL, null) ?: return

    val hasLocationPermission = ContextCompat.checkSelfPermission(
      this, Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED

    if (!hasLocationPermission) {
      postAlert(apiBaseUrl, token, null, null)
      return
    }

    fusedLocationClient.lastLocation
      .addOnSuccessListener { location: Location? ->
        postAlert(apiBaseUrl, token, location?.latitude, location?.longitude)
      }
      .addOnFailureListener {
        postAlert(apiBaseUrl, token, null, null)
      }
  }

  private fun postAlert(apiBaseUrl: String, token: String, lat: Double?, lon: Double?) {
    serviceScope.launch {
      try {
        val json = JSONObject()
        if (lat != null) json.put("lat", lat)
        if (lon != null) json.put("lon", lon)
        val body = json.toString().toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
          .url("$apiBaseUrl/safety/fall-alert")
          .addHeader("Authorization", "Bearer $token")
          .post(body)
          .build()
        httpClient.newCall(request).execute().use { response ->
          if (!response.isSuccessful) {
            android.util.Log.w("FallDetection", "fall-alert POST failed: ${response.code}")
          }
        }
      } catch (e: IOException) {
        android.util.Log.w("FallDetection", "fall-alert POST failed", e)
      }
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID, "Fall detection monitoring", NotificationManager.IMPORTANCE_MIN
      ).apply {
        description = "Shows while BimaRide is watching for a fall, even when the app is closed."
      }
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(channel)
    }
  }

  private fun buildNotification(): Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("BimaRide safety monitoring is on")
      .setContentText("Watching for a fall. Turn off anytime in the app's Profile screen.")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .build()
  }
}
