"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, type Need, type Task } from "../../../../lib/api";

type NeedResponse = { data: Need };
type CreateTaskResponse = { data: Task; matches: unknown[] };

export default function TaskCreateClient({ reportId }: { reportId: string }) {
  const router = useRouter();

  const [need, setNeed] = useState<Need | null>(null);
  const [title, setTitle] = useState("");
  const [locationText, setLocationText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadNeed() {
      if (!reportId) return;
      try {
        const response = await apiGet<NeedResponse>(`/needs/${reportId}`);
        setNeed(response.data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load need");
      }
    }

    void loadNeed();
  }, [reportId]);

  useEffect(() => {
    if (!need) return;
    setTitle((current) => current || `Response: ${need.title}`);
    setLocationText((current) => current || need.location_text);
  }, [need]);

  const defaultDeadline = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportId) return;

    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await apiPost<CreateTaskResponse>("/tasks", {
        report_id: reportId,
        title: String(form.get("title") || ""),
        description: String(form.get("description") || ""),
        required_skills: String(form.get("required_skills") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        estimated_hours: Number(form.get("estimated_hours") || 0),
        deadline: new Date(String(form.get("deadline") || defaultDeadline)).toISOString(),
        location_text: String(form.get("location_text") || ""),
        volunteer_slots: Number(form.get("volunteer_slots") || 1),
      });

      router.push(`/coordinator/tasks/${response.data.id}/matches`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold text-slate-900">Create Task</h1>
          <Link href="/coordinator/needs" className="text-sm font-semibold text-slate-600 underline">
            Back
          </Link>
        </div>

        {need ? (
          <div className="glass rounded-2xl p-4 soft-ring">
            <p className="text-xs uppercase tracking-wide text-slate-500">Linked Need</p>
            <p className="text-lg font-semibold text-slate-900">{need.title}</p>
            <p className="text-sm text-slate-600">{need.location_text}</p>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="glass space-y-4 rounded-3xl p-6 soft-ring">
          <input
            name="title"
            required
            placeholder="Task title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          />
          <textarea name="description" rows={4} placeholder="Description" className="w-full rounded-xl border border-slate-300 px-3 py-2" />
          <input name="required_skills" placeholder="Required skills (comma separated)" className="w-full rounded-xl border border-slate-300 px-3 py-2" />

          <div className="grid gap-4 md:grid-cols-2">
            <input name="estimated_hours" type="number" min={0} defaultValue={2} className="rounded-xl border border-slate-300 px-3 py-2" />
            <input name="deadline" type="datetime-local" defaultValue={defaultDeadline} className="rounded-xl border border-slate-300 px-3 py-2" />
          </div>

          <input
            name="location_text"
            required
            placeholder="Location"
            value={locationText}
            onChange={(event) => setLocationText(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          />

          <input name="volunteer_slots" type="number" min={1} defaultValue={1} className="w-full rounded-xl border border-slate-300 px-3 py-2" />

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button type="submit" disabled={saving} className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Creating..." : "Create Task + Find Volunteers"}
          </button>
        </form>
      </div>
    </main>
  );
}
