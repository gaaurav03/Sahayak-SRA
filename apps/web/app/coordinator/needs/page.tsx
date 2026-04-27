import Link from "next/link";
import { apiGet, type Need } from "../../../lib/api";

type NeedsResponse = { data: Need[] };

function urgencyBadgeClass(score: number) {
  if (score >= 7) return "bg-rose-100 text-rose-700";
  if (score >= 4) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

export default async function CoordinatorNeedsPage() {
  let needs: Need[] = [];
  let errorText = "";

  try {
    const response = await apiGet<NeedsResponse>("/needs?status=open");
    needs = response.data;
  } catch (error) {
    errorText = error instanceof Error ? error.message : "Failed to load needs";
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl font-semibold text-slate-900">Needs Dashboard</h1>
            <p className="text-slate-600">Urgency ranked reports for your single-org MVP demo.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/submit" className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white">
              Add Need
            </Link>
            <Link href="/coordinator/volunteers" className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700">
              Volunteers
            </Link>
          </div>
        </header>

        {errorText ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorText}
          </div>
        ) : null}

        <section className="space-y-4">
          {needs.map((need) => (
            <article key={need.id} className="glass rounded-3xl p-6 soft-ring">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{need.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{need.location_text}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-700">
                    {need.category}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${urgencyBadgeClass(need.urgency_score)}`}>
                    Urgency {need.urgency_score}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-sm text-slate-700">{need.description || "No description provided."}</p>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <p className="text-xs uppercase text-slate-500">Severity</p>
                  <p className="text-sm font-semibold text-slate-900">{need.severity_self}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <p className="text-xs uppercase text-slate-500">Affected Count</p>
                  <p className="text-sm font-semibold text-slate-900">{need.affected_count}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <p className="text-xs uppercase text-slate-500">Status</p>
                  <p className="text-sm font-semibold text-slate-900">{need.status}</p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between">
                <p className="text-xs text-slate-500">Created {new Date(need.created_at).toLocaleString()}</p>
                <Link
                  href={`/coordinator/tasks/new?report_id=${need.id}`}
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
                >
                  Create Task
                </Link>
              </div>
            </article>
          ))}

          {needs.length === 0 && !errorText ? (
            <div className="rounded-3xl border border-slate-200 bg-white/70 p-8 text-center text-slate-600">
              No needs yet. Click Add Need to start the flow.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
