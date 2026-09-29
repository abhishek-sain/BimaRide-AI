import { Accelerometer, Gyroscope } from "expo-sensors";
import * as Location from "expo-location";
import { api } from "../api/client";
import { TripPointOut } from "../types";
import { emptyState, LiveState, LocalEvent, stepLiveState } from "./localRules";

const UPLOAD_BATCH_INTERVAL_MS = 5000;
const SENSOR_UPDATE_INTERVAL_MS = 100; // 10 Hz IMU sampling

// Converts expo-sensors' unitless accelerometer output (1.0 == 9.81 m/s^2 on
// most Android/iOS builds) into "g" directly — matches the backend's units.
type Vec3 = { x: number; y: number; z: number };

export interface RideRecorderCallbacks {
  onLiveUpdate: (state: LiveState, lastPoint: TripPointOut | null) => void;
  onNewEvent: (event: LocalEvent) => void;
  onCrashSuspected: () => void;
}

export class RideRecorder {
  private tripId: string;
  private callbacks: RideRecorderCallbacks;
  private locationSub: Location.LocationSubscription | null = null;
  private accelSub: { remove: () => void } | null = null;
  private gyroSub: { remove: () => void } | null = null;
  private latestAccel: Vec3 = { x: 0, y: 0, z: 0 };
  private latestGyro: Vec3 = { x: 0, y: 0, z: 0 };
  private buffer: TripPointOut[] = [];
  private lastPoint: TripPointOut | null = null;
  private liveState: LiveState = emptyState();
  private uploadTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeading = 0;

  constructor(tripId: string, callbacks: RideRecorderCallbacks) {
    this.tripId = tripId;
    this.callbacks = callbacks;
  }

  async start() {
    const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
    if (locStatus !== "granted") throw new Error("Location permission denied");

    Accelerometer.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
    Gyroscope.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);

    this.accelSub = Accelerometer.addListener((data) => {
      this.latestAccel = data;
    });
    this.gyroSub = Gyroscope.addListener((data) => {
      // expo-sensors gyroscope is in rad/s; convert to deg/s to match backend
      this.latestGyro = {
        x: (data.x * 180) / Math.PI,
        y: (data.y * 180) / Math.PI,
        z: (data.z * 180) / Math.PI,
      };
    });

    this.locationSub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (loc) => this.onLocation(loc)
    );

    this.uploadTimer = setInterval(() => this.flush(), UPLOAD_BATCH_INTERVAL_MS);
  }

  private onLocation(loc: Location.LocationObject) {
    if (loc.coords.heading != null && loc.coords.heading >= 0) {
      this.lastHeading = loc.coords.heading;
    }

    const point: TripPointOut = {
      ts: new Date(loc.timestamp).toISOString(),
      lat: loc.coords.latitude,
      lon: loc.coords.longitude,
      speed_kmh: loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed * 3.6 : undefined,
      accel_x: this.latestAccel.x,
      accel_y: this.latestAccel.y,
      accel_z: this.latestAccel.z,
      gyro_x: this.latestGyro.x,
      gyro_y: this.latestGyro.y,
      gyro_z: this.latestGyro.z,
      heading: this.lastHeading,
    };

    this.buffer.push(point);

    const { state, newEvent, crashDetected } = stepLiveState(this.lastPoint, point, this.liveState);
    this.liveState = state;
    this.lastPoint = point;

    this.callbacks.onLiveUpdate(this.liveState, this.lastPoint);
    if (newEvent) this.callbacks.onNewEvent(newEvent);
    if (crashDetected) this.callbacks.onCrashSuspected();
  }

  private async flush() {
    if (this.buffer.length === 0) return;
    const toSend = this.buffer;
    this.buffer = [];
    try {
      await api.post(`/trips/${this.tripId}/points`, { points: toSend });
    } catch (err) {
      // Keep points for the next flush attempt instead of dropping them —
      // matches the deck's "on-device buffer + retry" behaviour.
      this.buffer = [...toSend, ...this.buffer];
      console.warn("Point upload failed, will retry:", err);
    }
  }

  async stop() {
    this.locationSub?.remove();
    this.accelSub?.remove();
    this.gyroSub?.remove();
    if (this.uploadTimer) clearInterval(this.uploadTimer);
    await this.flush(); // final flush before ending the trip
  }

  getLiveState() {
    return this.liveState;
  }
}
