"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost } from "../../lib/api";

const categories = ["water", "health", "food", "shelter", "education", "other"];
const severities = ["low", "medium", "high", "critical"];

export default function SubmitNeedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);

    try {
      await apiPost<{ data: { id: string } }>("/needs", {
        title: String(form.get("title") || ""),
        category: String(form.get("category") || "other"),
        description: String(form.get("description") || ""),
        location_text: String(form.get("location_text") || ""),
        severity_self: String(form.get("severity_self") || "low"),
        affected_count: Number(form.get("affected_count") || 0),
      });

      router.push("/coordinator/needs");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold text-slate-900">Submit Need</h1>
          <Link href="/coordinator/needs" className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600">
            Back to Dashboard
          </Link>
        </div>

        <form onSubmit={onSubmit} className="glass space-y-5 rounded-3xl p-6 soft-ring">
          <label className="block text-sm font-semibold text-slate-700">
            Title
            <input name="title" required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Category
            <select name="category" defaultValue="water" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Description
            <textarea name="description" rows={4} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Location Text
            <input name="location_text" required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              Severity
              <select name="severity_self" defaultValue="medium" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                {severities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Affected Count
              <input name="affected_count" type="number" min={0} defaultValue={0} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button
            disabled={loading}
            type="submit"
            className="rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Submitting..." : "Submit Need"}
          </button>
        </form>
      </div>
    </main>
  );
}
