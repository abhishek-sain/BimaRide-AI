import { HeatmapPoint, PortfolioSummary, RiderDrilldown, RiderSummary } from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Backend request failed: ${path} (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const insurerApi = {
  portfolio: () => get<PortfolioSummary>("/insurer/portfolio"),
  riders: () => get<RiderSummary[]>("/insurer/riders"),
  riderDrilldown: (riderId: string) => get<RiderDrilldown>(`/insurer/riders/${riderId}`),
  heatmap: () => get<HeatmapPoint[]>("/insurer/heatmap"),
};
