export interface FallDetectionModuleType {
  /** Starts the native foreground service that watches for a fall even
   * with the app closed. `token` is the rider's current bearer token and
   * `apiBaseUrl` the backend's base URL — both are cached on-device
   * (SharedPreferences) since the service must keep working without a
   * running JS engine. Returns true if the service was asked to start. */
  startMonitoring(token: string, apiBaseUrl: string): boolean;
  /** Stops the service and clears the "enabled" flag so it doesn't
   * restart itself after a reboot. */
  stopMonitoring(): boolean;
  /** Whether the service is currently meant to be running (this reads a
   * persisted flag, not live service state — accurate enough for a
   * Profile-screen toggle). */
  isMonitoring(): boolean;
}
