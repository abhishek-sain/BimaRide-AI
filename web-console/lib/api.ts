import { HeatmapPoint, PortfolioSummary, RiderDrilldown, RiderSummary } from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
// Server-only env var (no NEXT_PUBLIC_ prefix) — never sent to the browser.
// Calls happen in Server Components/route handlers, so this stays server-side.
const INSURER_API_KEY = process.env.INSURER_API_KEY ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    headers: { "x-insurer-api-key": INSURER_API_KEY },
  });
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
