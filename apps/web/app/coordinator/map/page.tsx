"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiGet, type Need } from "../../../lib/api";

type NeedsResponse = { data: Need[] };

interface PlottableNeed extends Need {
  resolvedLat: number;
  resolvedLng: number;
}

function getPriority(score: number): "high" | "medium" | "low" {
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

const PRIORITY_COLORS = {
  high:   { hex: "#ef4444", emoji: "🔴", label: "High Priority",   ring: "#fca5a5" },
  medium: { hex: "#f59e0b", emoji: "🟡", label: "Medium Priority", ring: "#fcd34d" },
  low:    { hex: "#22c55e", emoji: "🟢", label: "Low Priority",    ring: "#86efac" },
};

// Geocode a text string via Nominatim (rate limited — call one at a time)
async function geocodeText(text: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch { /* ignore */ }
  return null;
}

// Sleep helper for rate limiting Nominatim (1 req/s)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { L: any; }
}

export default function MapViewPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<unknown[]>([]);

  const [allNeeds, setAllNeeds] = useState<Need[]>([]);
  const [plottable, setPlottable] = useState<PlottableNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState({ done: 0, total: 0 });
  const [mapReady, setMapReady] = useState(false);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [selected, setSelected] = useState<Need | null>(null);
  const scriptsLoadedRef = useRef(false);

  /* ── Load all needs ── */
  const loadNeeds = useCallback(async () => {
    try {
      const res = await apiGet<NeedsResponse>("/needs?status=open,task_created,pending,resolved");
      setAllNeeds(res.data ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadNeeds(); }, [loadNeeds]);

  /* ── Geocode needs that lack coordinates ── */
  useEffect(() => {
    if (allNeeds.length === 0) return;

    async function resolveCoords() {
      const needsWithCoords: PlottableNeed[] = [];
      const needsToGeocode: Need[] = [];

      for (const n of allNeeds) {
        if (n.lat != null && n.lng != null) {
          needsWithCoords.push({ ...n, resolvedLat: n.lat, resolvedLng: n.lng });
        } else {
          needsToGeocode.push(n);
        }
      }

      // Immediately show those with stored coords
      setPlottable(needsWithCoords);

      if (needsToGeocode.length === 0) return;

      setGeocoding(true);
      setGeocodeProgress({ done: 0, total: needsToGeocode.length });

      const extra: PlottableNeed[] = [];
      for (let i = 0; i < needsToGeocode.length; i++) {
        const n = needsToGeocode[i];
        const coords = await geocodeText(n.location_text);
        if (coords) {
          extra.push({ ...n, resolvedLat: coords.lat, resolvedLng: coords.lng });
          setPlottable((prev) => [...prev, { ...n, resolvedLat: coords.lat, resolvedLng: coords.lng }]);
        }
        setGeocodeProgress({ done: i + 1, total: needsToGeocode.length });
        // Nominatim rate-limit: 1 req/sec
        if (i < needsToGeocode.length - 1) await sleep(1100);
      }

      setGeocoding(false);
      void extra; // suppress lint
    }

    void resolveCoords();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNeeds]);

  /* ── Load Leaflet ── */
  useEffect(() => {
    if (scriptsLoadedRef.current) return;
    scriptsLoadedRef.current = true;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => setMapReady(true);
    document.head.appendChild(script);
  }, []);

  /* ── Init map ── */
  useEffect(() => {
    if (!mapReady || !mapRef.current || leafletMapRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, { center: [20.5937, 78.9629], zoom: 5, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    leafletMapRef.current = map;
  }, [mapReady]);

  /* ── Refresh markers whenever plottable / filter changes ── */
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current || !window.L) return;
    const L = window.L;
    const map = leafletMapRef.current;

    // Remove old markers
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    const visible = plottable.filter((n) => {
      if (filter === "all") return true;
      return getPriority(n.urgency_score) === filter;
    });

    const bounds: [number, number][] = [];

    for (const need of visible) {
      const priority = getPriority(need.urgency_score);
      const color = PRIORITY_COLORS[priority];

      const icon = L.divIcon({
        className: "",
        html: `<div style="
          width:30px;height:30px;border-radius:50%;
          background:${color.hex};
          border:3px solid white;
          box-shadow:0 0 0 3px ${color.ring}99,0 3px 10px rgba(0,0,0,.35);
          display:flex;align-items:center;justify-content:center;
          cursor:pointer;transition:transform .15s ease;
        ">
          <div style="width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.8);"></div>
        </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([need.resolvedLat, need.resolvedLng], { icon });

      marker.bindPopup(`
        <div style="min-width:190px;font-family:system-ui,sans-serif;padding:2px">
          <div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:3px">${need.title}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:7px">${need.location_text}</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">
            <span style="background:${color.hex}22;color:${color.hex};border:1px solid ${color.hex}55;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:600">${color.emoji} ${color.label}</span>
            <span style="background:#f1f5f9;color:#475569;border-radius:999px;padding:2px 8px;font-size:10px;text-transform:uppercase">${need.category}</span>
          </div>
          <div style="font-size:11px;color:#475569">
            Urgency: <strong style="color:${color.hex}">${need.urgency_score}</strong> &nbsp;·&nbsp; Affected: <strong>${need.affected_count}</strong>
          </div>
          <div style="font-size:10px;color:#94a3b8;margin-top:4px;text-transform:capitalize">Status: ${need.status.replace("_"," ")}</div>
        </div>
      `);

      marker.on("click", () => setSelected(need));
      marker.addTo(map);
      markersRef.current.push(marker);
      bounds.push([need.resolvedLat, need.resolvedLng]);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [mapReady, plottable, filter]);

  /* ── Stats ── */
  const highCount   = plottable.filter((n) => getPriority(n.urgency_score) === "high").length;
  const mediumCount = plottable.filter((n) => getPriority(n.urgency_score) === "medium").length;
  const lowCount    = plottable.filter((n) => getPriority(n.urgency_score) === "low").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold text-slate-900">Map View</h1>
          <p className="text-slate-500 text-sm mt-1">Live geographic overview of all needs — colour-coded by urgency.</p>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {(["all", "high", "medium", "low"] as const).map((f) => {
            const isActive = filter === f;
            if (f === "all") {
              return (
                <button key="all" onClick={() => setFilter("all")}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
                    isActive ? "bg-slate-900 text-white shadow" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  All ({plottable.length})
                </button>
              );
            }
            const c = PRIORITY_COLORS[f];
            const count = f === "high" ? highCount : f === "medium" ? mediumCount : lowCount;
            return (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold flex items-center gap-1.5 transition-all ${isActive ? "shadow-md scale-105" : "opacity-80 hover:opacity-100"}`}
                style={isActive
                  ? { background: c.hex, color: "white", border: `2px solid ${c.hex}` }
                  : { background: `${c.hex}18`, color: c.hex, border: `2px solid ${c.hex}44` }}>
                {c.emoji} {c.label.split(" ")[0]} ({count})
              </button>
            );
          })}
        </div>
      </header>

      {/* Geocoding progress */}
      {geocoding && (
        <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
          <div className="text-sm text-blue-700">
            <strong>Geocoding existing needs…</strong>{" "}
            {geocodeProgress.done}/{geocodeProgress.total} locations resolved.
            New pins appear on the map as they are geocoded.
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total on Map", value: plottable.length, color: "text-slate-700", bg: "bg-slate-100" },
          { label: "🔴 High",      value: highCount,        color: "text-red-700",     bg: "bg-red-50"     },
          { label: "🟡 Medium",    value: mediumCount,      color: "text-amber-700",   bg: "bg-amber-50"   },
          { label: "🟢 Low",       value: lowCount,         color: "text-emerald-700", bg: "bg-emerald-50" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-2xl ${bg} border border-slate-100 px-4 py-3 text-center`}>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Map + detail panel */}
      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Map */}
        <div className="flex-1 rounded-3xl overflow-hidden border border-slate-200 shadow-sm relative bg-slate-100" style={{ minHeight: 520 }}>
          {(loading || !mapReady) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50">
              <div className="text-slate-400 animate-pulse text-sm">{loading ? "Loading needs…" : "Initialising map…"}</div>
            </div>
          )}
          <div ref={mapRef} style={{ width: "100%", minHeight: 520 }} />
        </div>

        {/* Detail panel */}
        <div className="w-full lg:w-72 flex-shrink-0">
          {selected ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900 leading-tight">{selected.title}</h2>
                <button onClick={() => setSelected(null)} className="flex-shrink-0 text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
              </div>
              <p className="text-xs text-slate-500 break-all">{selected.location_text}</p>

              {(() => {
                const p = getPriority(selected.urgency_score);
                const c = PRIORITY_COLORS[p];
                return (
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full px-3 py-1 text-xs font-semibold"
                      style={{ background: `${c.hex}20`, color: c.hex, border: `1px solid ${c.hex}44` }}>
                      {c.emoji} {c.label}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 uppercase">
                      {selected.category}
                    </span>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Urgency",   val: selected.urgency_score },
                  { label: "Affected",  val: selected.affected_count },
                  { label: "Severity",  val: selected.severity_self },
                  { label: "Status",    val: selected.status.replace("_"," ") },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-400 uppercase">{label}</p>
                    <p className="font-bold text-slate-800 text-sm capitalize">{val}</p>
                  </div>
                ))}
              </div>

              {selected.description && (
                <p className="text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">{selected.description}</p>
              )}

              {selected.status === "open" && (
                <a href={`/coordinator/tasks/new?report_id=${selected.id}`}
                  className="block w-full text-center rounded-full bg-slate-900 text-white text-sm font-semibold py-2.5 hover:bg-slate-700 transition-colors">
                  Create Task →
                </a>
              )}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 h-full flex flex-col items-center justify-center text-center gap-3 min-h-40">
              <div className="text-4xl">📍</div>
              <p className="text-slate-500 text-sm">Click any pin on the map to view need details here.</p>
              {!loading && !geocoding && plottable.length === 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-1">
                  No needs could be mapped. Submit a need with a recognisable location name to see it here.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
