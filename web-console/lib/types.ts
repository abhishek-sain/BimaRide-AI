export interface PortfolioSummary {
  active_riders: number;
  avg_score: number;
  safe_pct: number;
  medium_pct: number;
  high_pct: number;
  crash_alerts: number;
}

export interface RiderSummary {
  rider_id: string;
  name: string;
  score: number;
  risk_band: "SAFE" | "GOOD" | "MEDIUM" | "HIGH" | "UNSCORED";
  distance_km_30d: number;
  harsh_braking_30d: number;
  overspeed_30d: number;
  crash_events_30d: number;
}

export interface HeatmapPoint {
  lat: number;
  lon: number;
  type: string;
  color: "green" | "yellow" | "red";
}

export interface RiderDrilldownTrip {
  id: string;
  started_at: string;
  distance_km: number;
  trip_score: number | null;
  status: string;
  events: { type: string; severity: string }[];
}

export interface RiderDrilldown {
  rider: { id: string; name: string; city: string | null; bike_model: string | null };
  trips: RiderDrilldownTrip[];
}
