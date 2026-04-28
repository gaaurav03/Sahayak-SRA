import Link from "next/link";
import NeedTimeline from "../../../../components/NeedTimeline";
import { apiGet, type Need, type NeedTimelineEntry, type Task } from "../../../../lib/api";

type NeedResponse = { data: Need };
type TasksResponse = { data: Task[] };
type TimelineResponse = { data: NeedTimelineEntry[] };

export const dynamic = "force-dynamic";

export default async function VolunteerNeedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let need: Need | null = null;
  let tasks: Task[] = [];
  let timeline: NeedTimelineEntry[] = [];
  let errorText = "";

  try {
    const [needRes, taskRes, timelineRes] = await Promise.all([
      apiGet<NeedResponse>(`/needs/${id}`),
      apiGet<TasksResponse>(`/tasks?report_id=${id}`),
      apiGet<TimelineResponse>(`/needs/${id}/timeline`),
    ]);
    need = needRes.data;
    tasks = taskRes.data;
    timeline = timelineRes.data;
  } catch (error) {
    errorText = error instanceof Error ? error.message : "Failed to load need";
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold text-slate-900">Need Details</h1>
          <Link href="/volunteer/tasks" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Back
          </Link>
        </div>

        {errorText ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorText}</div>
        ) : null}

        {need ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-2xl font-semibold text-slate-900">{need.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{need.description}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Status: {need.status}</div>
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Category: {need.category}</div>
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Severity: {need.severity_self}</div>
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Urgency: {need.urgency_score}</div>
            </div>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="text-xs uppercase text-slate-500">Priority Analytics</p>
              <p className="mt-1 text-xs text-slate-600">Confidence: {need.urgency_confidence ?? 0}%</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(need.urgency_reasons ?? []).map((reason) => (
                  <span key={`${reason.label}-${reason.points}`} className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 border border-slate-200">
                    {reason.label} ({reason.points >= 0 ? "+" : ""}{reason.points})
                  </span>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <NeedTimeline entries={timeline} />

        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Tasks Under This Need</h3>
          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">No tasks for this need yet.</div>
          ) : (
            tasks.map((task) => (
              <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{task.title}</p>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{task.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{task.location_text}</p>
                <Link href={`/volunteer/tasks/${task.id}`} className="mt-3 inline-block rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700">
                  View Task Details
                </Link>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
