"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { apiPost, apiGet } from "../../lib/api";

const categories = ["water", "health", "food", "shelter", "education", "other"];
const severities = ["low", "medium", "high", "critical"];

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface SimilarNeed {
  id: string;
  title: string;
  category: string;
  location_text: string;
  urgency_score: number;
  status: string;
  affected_count: number;
  created_at: string;
  similarity_score: number;
  match_reasons: string[];
  distance_km: number | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:      { label: "Pending Review", color: "bg-amber-100 text-amber-700" },
  open:         { label: "Open",           color: "bg-blue-100 text-blue-700"   },
  task_created: { label: "Task in Progress", color: "bg-purple-100 text-purple-700" },
};

export default function SubmitNeedPage() {
  const router = useRouter();
  const { userId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [autoDetectAttempted, setAutoDetectAttempted] = useState(false);

  // ── Location search state
  const [locationQuery, setLocationQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [suggLoading, setSuggLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{
    text: string; lat: number; lng: number;
  } | null>(null);
  const [showSugg, setShowSugg] = useState(false);
  const geoDebRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // ── Duplicate detection state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("water");
  const [similarNeeds, setSimilarNeeds] = useState<SimilarNeed[]>([]);
  const [checkingDups, setCheckingDups] = useState(false);
  const [dismissedDups, setDismissedDups] = useState(false);
  const dupDebRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Geocode via Nominatim
  const geocode = useCallback(async (query: string) => {
    if (query.trim().length < 3) { setSuggestions([]); return; }
    setSuggLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1&countrycodes=in`;
      const data: NominatimResult[] = await (await fetch(url, { headers: { "Accept-Language": "en" } })).json();
      setSuggestions(data);
      setShowSugg(true);
    } catch { setSuggestions([]); }
    finally { setSuggLoading(false); }
  }, []);

  useEffect(() => {
    if (geoDebRef.current) clearTimeout(geoDebRef.current);
    if (locationQuery.trim().length < 3) { setSuggestions([]); return; }
    geoDebRef.current = setTimeout(() => geocode(locationQuery), 400);
    return () => { if (geoDebRef.current) clearTimeout(geoDebRef.current); };
  }, [locationQuery, geocode]);

  // Close suggestions on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node))
        setShowSugg(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  function pickSuggestion(s: NominatimResult) {
    setSelectedLocation({ text: s.display_name, lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
    setLocationQuery(s.display_name);
    setSuggestions([]);
    setShowSugg(false);
    setDismissedDups(false);
  }

  function detectGPS() {
    if (!navigator.geolocation) { setError("Geolocation not supported."); return; }
    setSuggLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { "Accept-Language": "en" } }
        );
        const d = await res.json() as { display_name?: string };
        const text = d.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setSelectedLocation({ text, lat, lng });
        setLocationQuery(text);
      } catch {
        const text = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setSelectedLocation({ text, lat, lng });
        setLocationQuery(text);
      }
      setSuggLoading(false);
      setDismissedDups(false);
    }, () => {
      setError("Could not get location. Allow browser location access.");
      setSuggLoading(false);
    });
  }

  useEffect(() => {
    if (autoDetectAttempted || selectedLocation || locationQuery.trim().length > 0) return;
    setAutoDetectAttempted(true);
    detectGPS();
  }, [autoDetectAttempted, selectedLocation, locationQuery]);

  // ── Duplicate check (fires when title + category + location are all set)
  const checkDuplicates = useCallback(async (
    t: string, cat: string, loc: { text: string; lat: number; lng: number } | null
  ) => {
    if (!t.trim() || !cat || !loc) { setSimilarNeeds([]); return; }
    setCheckingDups(true);
    try {
      const params = new URLSearchParams({
        title: t.trim(),
        category: cat,
        location_text: loc.text,
        lat: String(loc.lat),
        lng: String(loc.lng),
      });
      const res = await apiGet<{ data: SimilarNeed[] }>(`/needs/similar?${params}`);
      setSimilarNeeds(res.data ?? []);
      setDismissedDups(false);
    } catch {
      setSimilarNeeds([]);
    } finally {
      setCheckingDups(false);
    }
  }, []);

  useEffect(() => {
    if (dupDebRef.current) clearTimeout(dupDebRef.current);
    if (!title.trim() || !selectedLocation) { setSimilarNeeds([]); return; }
    dupDebRef.current = setTimeout(
      () => checkDuplicates(title, category, selectedLocation),
      700
    );
    return () => { if (dupDebRef.current) clearTimeout(dupDebRef.current); };
  }, [title, category, selectedLocation, checkDuplicates]);

  // ── Submit
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLocation) {
      setError("Please select a valid location from the suggestions or use GPS.");
      return;
    }
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const evidenceImageUrl = String(form.get("evidence_image_url") || "").trim();
    if (!evidenceImageUrl) {
      setError("At least one evidence image URL is required.");
      setLoading(false);
      return;
    }
    try {
      await apiPost<{ data: { id: string } }>("/needs", {
        title:            String(form.get("title") || ""),
        category:         String(form.get("category") || "other"),
        description:      String(form.get("description") || ""),
        location_text:    selectedLocation.text,
        lat:              selectedLocation.lat,
        lng:              selectedLocation.lng,
        image_urls:       [evidenceImageUrl],
        client_captured_at: new Date().toISOString(),
        severity_self:    String(form.get("severity_self") || "low"),
        affected_count:   Number(form.get("affected_count") || 0),
        reporter_clerk_id: userId ?? undefined,
      });
      setSuccess(true);
      setTimeout(() => router.push("/reporter/my-reports"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Success screen
  if (success) {
    return (
      <main className="min-h-screen px-6 py-12 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">Report Submitted!</h1>
          <p className="text-slate-500">Pending coordinator review. Track it in <strong>My Submissions</strong>.</p>
          <p className="text-slate-400 text-sm mt-4">Redirecting…</p>
        </div>
      </main>
    );
  }

  const showDupBanner = similarNeeds.length > 0 && !dismissedDups;

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-3xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold text-slate-900">Submit a Need</h1>
            <p className="text-slate-500 text-sm mt-1">Your report will be reviewed by a coordinator before it&apos;s published.</p>
          </div>
          <Link href="/reporter/my-reports" className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600">
            My Submissions
          </Link>
        </div>

        {/* ── Duplicate warning banner */}
        {showDupBanner && (
          <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 overflow-hidden shadow-sm">
            <div className="px-4 py-3 flex items-start justify-between gap-3 bg-amber-100 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <div>
                  <p className="font-semibold text-amber-900 text-sm">Similar issue{similarNeeds.length > 1 ? "s" : ""} already reported</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {similarNeeds.length} existing report{similarNeeds.length > 1 ? "s" : ""} found in this area with a similar description.
                    Please review before submitting a duplicate.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDismissedDups(true)}
                className="flex-shrink-0 text-amber-500 hover:text-amber-700 text-xl leading-none mt-0.5"
                title="Dismiss"
              >×</button>
            </div>

            <div className="divide-y divide-amber-100">
              {similarNeeds.map((n) => {
                const st = STATUS_LABELS[n.status] ?? { label: n.status, color: "bg-slate-100 text-slate-600" };
                return (
                  <div key={n.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{n.title}</p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{n.location_text}</p>
                      </div>
                      <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                      {n.match_reasons.map((r) => (
                        <span key={r} className="rounded-full bg-amber-200 text-amber-800 px-2 py-0.5 text-xs font-medium">
                          {r}
                        </span>
                      ))}
                      {n.distance_km != null && (
                        <span className="text-xs text-slate-400">📍 {n.distance_km} km away</span>
                      )}
                      <span className="text-xs text-slate-400 ml-auto">
                        Urgency {n.urgency_score} · {n.affected_count} affected
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 flex items-center justify-between">
              <p className="text-xs text-amber-700">
                You can still submit if this is a different or more urgent incident.
              </p>
              <button
                type="button"
                onClick={() => setDismissedDups(true)}
                className="text-xs font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900"
              >
                Continue anyway →
              </button>
            </div>
          </div>
        )}

        {/* Duplicate check spinner */}
        {checkingDups && (
          <div className="mb-4 flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            Checking for similar reports…
          </div>
        )}

        {/* Form */}
        <form onSubmit={onSubmit} className="glass space-y-5 rounded-3xl p-6 soft-ring">
          {/* Title */}
          <label className="block text-sm font-semibold text-slate-700">
            Title *
            <input
              name="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. No clean water in Ward 7"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </label>

          {/* Category */}
          <label className="block text-sm font-semibold text-slate-700">
            Category
            <select
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              {categories.map((item) => (
                <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>
              ))}
            </select>
          </label>

          {/* Description */}
          <label className="block text-sm font-semibold text-slate-700">
            Description
            <textarea
              name="description"
              rows={4}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Evidence Image URL *
            <input
              name="evidence_image_url"
              type="url"
              required
              placeholder="https://..."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Add a real photo link so coordinators can verify the report faster.
            </span>
          </label>

          {/* Location with geocoding */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">
              Location *{" "}
              <span className="text-xs font-normal text-slate-400">(type to search or use GPS)</span>
            </p>

            <div className="relative" ref={suggestionsRef}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={locationQuery}
                    onChange={(e) => {
                      setLocationQuery(e.target.value);
                      if (selectedLocation) setSelectedLocation(null);
                    }}
                    onFocus={() => suggestions.length > 0 && setShowSugg(true)}
                    placeholder="e.g. Meerut, Uttar Pradesh"
                    className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors ${
                      selectedLocation
                        ? "border-emerald-400 focus:ring-emerald-300 bg-emerald-50"
                        : "border-slate-300 focus:ring-slate-400"
                    }`}
                  />
                  {suggLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={detectGPS}
                  disabled={suggLoading}
                  className="flex-shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors"
                >
                  📍 GPS
                </button>
              </div>

              {/* Dropdown */}
              {showSugg && suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                  {suggestions.map((s) => (
                    <button
                      key={s.place_id}
                      type="button"
                      onMouseDown={() => pickSuggestion(s)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors"
                    >
                      <span className="text-slate-400 mr-2">📍</span>
                      <span className="text-slate-800">{s.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedLocation ? (
              <div className="flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                <span className="text-emerald-600 text-sm mt-0.5">✓</span>
                <div>
                  <p className="text-xs font-semibold text-emerald-800">Location confirmed</p>
                  <p className="text-xs text-emerald-600 break-all">{selectedLocation.text}</p>
                  <p className="text-xs text-emerald-500 mt-0.5">
                    {selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)}
                  </p>
                </div>
              </div>
            ) : locationQuery.length > 2 ? (
              <p className="text-xs text-amber-600">⚠️ Select a location from the dropdown or click GPS.</p>
            ) : null}
          </div>

          {/* Severity + Affected */}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              Severity
              <select name="severity_self" defaultValue="medium" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                {severities.map((item) => (
                  <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              People Affected
              <input
                name="affected_count"
                type="number"
                min={0}
                defaultValue={0}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </label>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              disabled={loading}
              type="submit"
              className="flex-1 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60 hover:bg-slate-700 transition-colors"
            >
              {loading ? "Submitting…" : "Submit Report →"}
            </button>
            {showDupBanner && (
              <p className="text-xs text-amber-700 font-medium">
                ⚠️ {similarNeeds.length} similar report{similarNeeds.length > 1 ? "s" : ""} found
              </p>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
