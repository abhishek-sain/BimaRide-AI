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
  emergency_contacts: { name: string; phone: string }[];
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
  status: "active" | "completed" | "crash_flagged";
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
