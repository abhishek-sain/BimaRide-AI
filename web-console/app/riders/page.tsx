import Link from "next/link";
import { insurerApi } from "@/lib/api";
import RiskBadge from "@/components/RiskBadge";

export const dynamic = "force-dynamic";

export default async function RidersPage() {
  const riders = await insurerApi.riders();

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">All riders</h1>
      <p className="text-slate-500 text-sm mb-6">{riders.length} riders on the platform, sorted by score.</p>

      <div className="rounded-2xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/80 text-slate-400 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Rider</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Risk band</th>
              <th className="px-4 py-3 font-medium">Distance (30d)</th>
              <th className="px-4 py-3 font-medium">Harsh braking</th>
              <th className="px-4 py-3 font-medium">Overspeed</th>
              <th className="px-4 py-3 font-medium">Crash events</th>
            </tr>
          </thead>
          <tbody>
            {riders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  No riders yet.
                </td>
              </tr>
            )}
            {riders.map((r) => (
              <tr key={r.rider_id} className="border-t border-slate-800 hover:bg-slate-900/40">
                <td className="px-4 py-3">
                  <Link href={`/riders/${r.rider_id}`} className="text-white hover:text-sky-400">
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-semibold">{Math.round(r.score)}</td>
                <td className="px-4 py-3">
                  <RiskBadge band={r.risk_band} />
                </td>
                <td className="px-4 py-3">{r.distance_km_30d} km</td>
                <td className="px-4 py-3">{r.harsh_braking_30d}</td>
                <td className="px-4 py-3">{r.overspeed_30d}</td>
                <td className="px-4 py-3">{r.crash_events_30d > 0 ? `⚠️ ${r.crash_events_30d}` : "0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
