"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet, apiPost, type Volunteer } from "../../../lib/api";

type VolunteersResponse = { data: Volunteer[] };

export default function VolunteersPage() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadVolunteers() {
    setLoading(true);
    try {
      const response = await apiGet<VolunteersResponse>("/volunteers");
      setVolunteers(response.data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load volunteers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadVolunteers();
  }, []);

  function normalizeEmail(value: FormDataEntryValue | null) {
    return String(value || "").trim().toLowerCase();
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = normalizeEmail(form.get("email"));

    if (email && volunteers.some((volunteer) => (volunteer.email || "").toLowerCase() === email)) {
      setError(`A volunteer with email ${email} already exists.`);
      setSaving(false);
      return;
    }

    try {
      await apiPost<{ data: Volunteer }>("/volunteers", {
        full_name: String(form.get("full_name") || ""),
        phone: String(form.get("phone") || ""),
        email: email || null,
        skills: String(form.get("skills") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        location_text: String(form.get("location_text") || ""),
        availability: { Mon: ["09:00-17:00"] },
        max_tasks: Number(form.get("max_tasks") || 2),
        is_active: Boolean(form.get("is_active")),
      });
      formElement.reset();
      await loadVolunteers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create volunteer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[380px_1fr]">
        <section className="glass rounded-3xl p-6 soft-ring">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="font-display text-2xl font-semibold text-slate-900">Volunteer Registry</h1>
            <Link href="/coordinator/needs" className="text-xs font-semibold text-slate-600 underline">
              Back
            </Link>
          </div>
          <form className="space-y-3" onSubmit={onSubmit}>
            <input name="full_name" placeholder="Full name" required className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            <input name="phone" placeholder="Phone" required className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            <input name="email" placeholder="Email (optional)" className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            <input name="skills" placeholder="Skills comma separated (medical,driving)" className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            <input name="location_text" placeholder="Location" required className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            <input name="max_tasks" type="number" min={1} defaultValue={2} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="is_active" type="checkbox" defaultChecked /> Active
            </label>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <button type="submit" disabled={saving} className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Saving..." : "Add Volunteer"}
            </button>
          </form>
        </section>

        <section className="space-y-4">
          {loading ? <p className="text-slate-600">Loading volunteers...</p> : null}
          {volunteers.map((v) => (
            <article key={v.id} className="glass rounded-3xl p-5 soft-ring">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{v.full_name}</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${v.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                  {v.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{v.location_text}</p>
              <p className="mt-2 text-sm text-slate-700">Skills: {(v.skills || []).join(", ") || "None"}</p>
              <p className="mt-1 text-sm text-slate-700">
                Active tasks: {v.active_tasks}/{v.max_tasks} • Deployments: {v.total_deployments}
              </p>
            </article>
          ))}

          {!loading && volunteers.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-6 text-center text-slate-600">
              No volunteers yet.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
