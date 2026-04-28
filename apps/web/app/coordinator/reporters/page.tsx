"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiGet, type Need, type UserProfile } from "../../../lib/api";

type UsersResponse = { data: UserProfile[] };
type NeedsResponse = { data: Need[] };

export default function CoordinatorReportersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [reporters, setReporters] = useState<UserProfile[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [usersRes, needsRes] = await Promise.all([
          apiGet<UsersResponse>("/users?role=reporter"),
          apiGet<NeedsResponse>("/needs?status=pending,open,task_created,resolved,rejected"),
        ]);
        setReporters(usersRes.data ?? []);
        setNeeds(needsRes.data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load field reporters");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const reportCountByClerkId = useMemo(() => {
    const map = new Map<string, number>();
    for (const need of needs) {
      const key = need.reporter_clerk_id ?? "";
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [needs]);

  const filtered = reporters.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.full_name.toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q) ||
      (r.phone ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-slate-900">Field Reporters</h1>
        <p className="mt-1 text-sm text-slate-500">{reporters.length} registered reporter profiles</p>
      </header>

      <input
        type="text"
        placeholder="Search by name, email, or phone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
      />

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {loading ? (
        <div className="py-12 text-center text-slate-400">Loading reporters...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No field reporters found.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <article key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/coordinator/reporters/${r.clerk_id}`} className="text-lg font-semibold text-slate-900 underline-offset-2 hover:underline">
                    {r.full_name}
                  </Link>
                  <p className="text-sm text-slate-500">{r.email ?? "No email"}{r.phone ? ` · ${r.phone}` : ""}</p>
                  <p className="mt-1 text-xs text-slate-400">Clerk ID: {r.clerk_id}</p>
                </div>
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                  Reports: {reportCountByClerkId.get(r.clerk_id) ?? 0}
                </span>
              </div>
              <div className="mt-3">
                <Link href={`/coordinator/reporters/${r.clerk_id}`} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
                  View Full Profile
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
