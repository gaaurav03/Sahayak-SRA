import Link from "next/link";
import {
  apiGet,
  type AnalyticsOverview,
} from "../../../lib/api";
import AnalyticsCharts from "./AnalyticsCharts";

type AnalyticsResponse = { data: AnalyticsOverview };

export const dynamic = "force-dynamic";

function percent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function metricTone(value: number, inverse = false) {
  if (value === 0) return "text-emerald-700";
  if (inverse) return value > 0 ? "text-emerald-700" : "text-rose-700";
  return value > 0 ? "text-rose-700" : "text-emerald-700";
}

export default async function ReporterAnalyticsPage() {
  let analytics: AnalyticsOverview | null = null;
  let errorText = "";

  try {
    const response = await apiGet<AnalyticsResponse>("/analytics/overview");
    analytics = response.data;
  } catch (error) {
    errorText =
      error instanceof Error ? error.message : "Failed to load analytics";
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
              Platform Analytics
            </p>
            <h1 className="font-display text-4xl font-semibold text-slate-900">
              Operational pulse across needs, tasks, and volunteers
            </h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              This view tracks the real pressure points in the Sahayak workflow:
              incoming need volume, task execution throughput, volunteer capacity,
              and the skill gaps most likely to stall response.
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/reporter/my-reports"
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
            >
              My Submissions
            </Link>
          </div>
        </header>

        {errorText ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorText}
          </div>
        ) : null}

        {analytics ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="glass rounded-3xl p-5 soft-ring">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Open Needs
                </p>
                <p className="mt-3 text-4xl font-semibold text-slate-900">
                  {analytics.summary.openNeeds}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Current unresolved need reports awaiting tasking or closure.
                </p>
              </article>

              <article className="glass rounded-3xl p-5 soft-ring">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Active Tasks
                </p>
                <p className="mt-3 text-4xl font-semibold text-slate-900">
                  {analytics.summary.activeTasks}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Open, assigned, and in-progress work currently in the pipeline.
                </p>
              </article>

              <article className="glass rounded-3xl p-5 soft-ring">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Volunteer Utilization
                </p>
                <p className="mt-3 text-4xl font-semibold text-slate-900">
                  {percent(analytics.summary.volunteerUtilizationRate)}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {analytics.summary.availableVolunteers} volunteers still have deployable capacity.
                </p>
              </article>

              <article className="glass rounded-3xl p-5 soft-ring">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Verified Completion Rate
                </p>
                <p className="mt-3 text-4xl font-semibold text-slate-900">
                  {percent(analytics.summary.verifiedCompletionRate)}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Share of all created tasks that have fully reached verified state.
                </p>
              </article>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.9fr_1fr]">
              <article className="rounded-3xl border border-rose-200 bg-rose-50/80 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-rose-700">
                  Critical Watch
                </p>
                <p className="mt-3 text-3xl font-semibold text-rose-900">
                  {analytics.summary.unresolvedCriticalNeeds}
                </p>
                <p className="mt-2 text-sm text-rose-800">
                  High-urgency needs still unresolved.
                </p>
              </article>

              <article className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-amber-700">
                  Deadline Risk
                </p>
                <p className="mt-3 text-3xl font-semibold text-amber-900">
                  {analytics.summary.overdueTasks}
                </p>
                <p className="mt-2 text-sm text-amber-800">
                  In-flight tasks already past deadline.
                </p>
              </article>

              <article className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">
                  Capacity
                </p>
                <p className="mt-3 text-3xl font-semibold text-emerald-900">
                  {analytics.volunteerCapacity.usedSlots}/{analytics.volunteerCapacity.totalSlots}
                </p>
                <p className="mt-2 text-sm text-emerald-800">
                  Volunteer slots used across {analytics.volunteerCapacity.activeVolunteers} active volunteers.
                </p>
              </article>

              <article className="glass rounded-3xl p-5 soft-ring">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Average Open Urgency
                </p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">
                  {analytics.summary.averageOpenUrgency.toFixed(2)}
                </p>
                <p className={`mt-2 text-sm ${metricTone(analytics.summary.averageOpenUrgency >= 7 ? 1 : 0)}`}>
                  Open needs are {analytics.summary.averageOpenUrgency >= 7 ? "sitting in a critical band." : "below the critical band right now."}
                </p>
              </article>
            </section>

            <AnalyticsCharts data={analytics} />

            <section className="grid gap-6 xl:grid-cols-[1fr_1fr_1.15fr]">
              <article className="glass rounded-3xl p-6 soft-ring">
                <h2 className="text-lg font-semibold text-slate-900">
                  Need Resolution Snapshot
                </h2>
                <p className="text-sm text-slate-500">
                  Status spread from initial intake through resolution.
                </p>
                <div className="mt-5 space-y-3">
                  {analytics.needStatus.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize text-slate-700">
                          {item.label.replace("_", " ")}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          {item.value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass rounded-3xl p-6 soft-ring">
                <h2 className="text-lg font-semibold text-slate-900">
                  Top Volunteers By Deployments
                </h2>
                <p className="text-sm text-slate-500">
                  People carrying the most verified field history and current load.
                </p>
                <div className="mt-5 space-y-3">
                  {analytics.topVolunteers.map((volunteer) => (
                    <div
                      key={volunteer.id}
                      className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900">
                            {volunteer.full_name}
                          </p>
                          <p className="text-sm text-slate-500">
                            {volunteer.active_tasks}/{volunteer.max_tasks} active load
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            volunteer.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {volunteer.total_deployments} deployments
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="glass rounded-3xl p-6 soft-ring">
                <h2 className="text-lg font-semibold text-slate-900">
                  Recent Task Activity
                </h2>
                <p className="text-sm text-slate-500">
                  The last workflow transitions recorded in task events.
                </p>
                <div className="mt-5 space-y-3">
                  {analytics.recentTaskEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold capitalize text-slate-900">
                          {event.to_status.replace("_", " ")}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(event.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {event.actor_label}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        {event.note || "No note recorded."}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
