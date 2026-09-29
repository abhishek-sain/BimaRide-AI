import Link from "next/link";
import { insurerApi } from "@/lib/api";
import StatCard from "@/components/StatCard";
import RiskBadge from "@/components/RiskBadge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [portfolio, riders] = await Promise.all([insurerApi.portfolio(), insurerApi.riders()]);

  const watchlist = riders.filter((r) => r.risk_band === "HIGH" || r.risk_band === "MEDIUM").slice(0, 8);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Portfolio overview</h1>
        <p className="text-slate-500 text-sm mt-1">Live telematics across every rider on the platform.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active riders" value={String(portfolio.active_riders)} accent="blue" />
        <StatCard label="Avg score" value={portfolio.avg_score.toFixed(1)} accent="green" />
        <StatCard label="Safe + Good %" value={`${portfolio.safe_pct}%`} accent="green" />
        <StatCard label="Crash alerts" value={String(portfolio.crash_alerts)} accent="red" />
      </div>

      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6">
        <h2 className="font-semibold mb-4">Risk distribution</h2>
        <div className="flex h-4 rounded-full overflow-hidden bg-slate-800">
          <div className="bg-emerald-500" style={{ width: `${portfolio.safe_pct}%` }} />
          <div className="bg-amber-500" style={{ width: `${portfolio.medium_pct}%` }} />
          <div className="bg-red-500" style={{ width: `${portfolio.high_pct}%` }} />
        </div>
        <div className="flex gap-6 mt-3 text-xs text-slate-400">
          <span>🟢 Safe/Good {portfolio.safe_pct}%</span>
          <span>🟡 Medium {portfolio.medium_pct}%</span>
          <span>🔴 High {portfolio.high_pct}%</span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Riders needing attention</h2>
          <Link href="/riders" className="text-sm text-sky-400 hover:text-sky-300">
            View all riders →
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Rider</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Risk band</th>
                <th className="px-4 py-3 font-medium">Harsh braking (30d)</th>
                <th className="px-4 py-3 font-medium">Crash events (30d)</th>
              </tr>
            </thead>
            <tbody>
              {watchlist.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No riders currently flagged — portfolio is healthy.
                  </td>
                </tr>
              )}
              {watchlist.map((r) => (
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
                  <td className="px-4 py-3">{r.harsh_braking_30d}</td>
                  <td className="px-4 py-3">{r.crash_events_30d > 0 ? `⚠️ ${r.crash_events_30d}` : "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
