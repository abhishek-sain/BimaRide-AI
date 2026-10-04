export interface Rider {
  id: string;
  name: string;
  email: string;
  phone?: string;
  date_of_birth?: string;
  city?: string;
  bike_model?: string;
  bike_reg_number?: string;
  bike_year?: number;
  insurer_name?: string;
  policy_number?: string;
  idv?: number;
  ncb_percent?: number;
  policy_expiry?: string;
  connect_code: string;
  emergency_contacts: { name: string; phone: string }[];
  mutual_aid_optin: boolean;
}

export interface ContactUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  connect_code: string;
}

export interface Connection {
  id: string;
  status: "pending" | "accepted";
  requested_by: "rider" | "contact";
  rider_id: string;
  rider_name: string;
  contact_id: string;
  contact_name: string;
  created_at: string;
  accepted_at?: string;
}

export interface ProfileUpdatePayload {
  name?: string;
  phone?: string;
  date_of_birth?: string;
  city?: string;
  bike_model?: string;
  bike_reg_number?: string;
  bike_year?: number | null;
  insurer_name?: string;
  policy_number?: string;
  idv?: number | null;
  ncb_percent?: number | null;
  policy_expiry?: string;
}

export interface RideEvent {
  id: string;
  event_type: "harsh_brake" | "harsh_accel" | "cornering" | "overspeed" | "crash_suspect";
  severity: "low" | "medium" | "high";
  ts: string;
  lat?: number;
  lon?: number;
  peak_value?: number;
  duration_s?: number;
  context?: Record<string, unknown>;
  coach_tip?: string;
}

export interface Trip {
  id: string;
  rider_id: string;
  started_at: string;
  ended_at?: string;
  status: "active" | "completed" | "crash_flagged" | "abandoned";
  distance_km: number;
  duration_s: number;
  avg_speed_kmh: number;
  max_speed_kmh: number;
  trip_score?: number;
  score_breakdown?: {
    components: Record<string, number>;
    weighted: Record<string, number>;
    events_per_100km: Record<string, number>;
  };
  events: RideEvent[];
}

export interface TripPointOut {
  ts: string;
  lat?: number;
  lon?: number;
  speed_kmh?: number;
  accel_x?: number;
  accel_y?: number;
  accel_z?: number;
  gyro_x?: number;
  gyro_y?: number;
  gyro_z?: number;
  heading?: number;
}

export interface SosAlert {
  id: string;
  trip_id: string;
  triggered_at: string;
  confirmed_ok?: boolean | null;
  dispatched: boolean;
}

export interface AlertAck {
  contact_id: string;
  name: string;
  at: string;
}

export interface CrashAlertRecord {
  id: string;
  trip_id: string;
  rider_id: string;
  rider_name: string;
  kind: "crash" | "manual";
  lat?: number | null;
  lon?: number | null;
  speed_kmh?: number | null;
  status: "open" | "acknowledged" | "rider_ok";
  created_at: string;
  rider_ok_at?: string | null;
  acknowledged_by: AlertAck[];
}

export interface NearbyPlace {
  name: string;
  kind: "hospital" | "police";
  lat: number;
  lon: number;
  distance_km: number;
}

export interface WeatherRisk {
  level: "low" | "moderate" | "high";
  reasons: string[];
  temperature_c?: number | null;
  wind_kmh?: number | null;
  visibility_m?: number | null;
  condition?: string | null;
}

export interface FallAlertRecord {
  id: string;
  rider_id: string;
  rider_name: string;
  lat?: number | null;
  lon?: number | null;
  status: "open" | "acknowledged" | "rider_ok";
  created_at: string;
  rider_ok_at?: string | null;
  acknowledged_by: AlertAck[];
}

export interface MutualAidPing {
  id: string;
  alert_id: string;
  status: "notified" | "responding" | "dismissed";
  distance_km: number;
  created_at: string;
  responded_at?: string | null;
  kind: "crash" | "manual";
  lat?: number | null;
  lon?: number | null;
  alert_status: "open" | "acknowledged" | "rider_ok";
}
