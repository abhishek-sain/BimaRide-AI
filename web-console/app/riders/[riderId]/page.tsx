import Link from "next/link";
import { insurerApi } from "@/lib/api";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  harsh_brake: "Harsh braking",
  harsh_accel: "Harsh acceleration",
  cornering: "Aggressive cornering",
  overspeed: "Overspeed",
  crash_suspect: "Possible crash",
};

export default async function RiderDrilldownPage(props: PageProps<"/riders/[riderId]">) {
  const { riderId } = await props.params;
  const data = await insurerApi.riderDrilldown(riderId);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <Link href="/riders" className="text-sm text-sky-400 hover:text-sky-300">
        ← All riders
      </Link>

      <h1 className="text-2xl font-bold mt-3">{data.rider.name}</h1>
      <p className="text-slate-500 text-sm mb-8">
        {data.rider.bike_model ?? "No bike on file"} · {data.rider.city ?? "No city on file"}
      </p>

      <h2 className="font-semibold mb-4">Trip history</h2>
      <div className="space-y-3">
        {data.trips.length === 0 && <p className="text-slate-500">No completed trips yet.</p>}
        {data.trips.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border p-4 ${
              t.status === "crash_flagged" ? "border-red-500/40 bg-red-500/5" : "border-slate-800 bg-slate-900/60"
            }`}
          >
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">{new Date(t.started_at).toLocaleString()}</span>
              <span className="text-lg font-bold">{t.trip_score != null ? Math.round(t.trip_score) : "--"}</span>
            </div>
            <div className="text-sm text-slate-400 mt-1">
              {t.distance_km} km
              {t.status === "crash_flagged" && <span className="text-red-400 ml-2">⚠️ crash flagged</span>}
            </div>
            {t.events.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {t.events.map((e, i) => (
                  <span key={i} className="text-xs rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                    {EVENT_LABEL[e.type] ?? e.type} · {e.severity}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
