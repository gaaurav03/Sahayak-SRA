import Link from "next/link";
import NeedTimeline from "../../../../components/NeedTimeline";
import { apiGet, type Need, type NeedTimelineEntry, type Task } from "../../../../lib/api";

type NeedResponse = { data: Need };
type TasksResponse = { data: Task[] };
type TimelineResponse = { data: NeedTimelineEntry[] };

export const dynamic = "force-dynamic";

export default async function ReporterNeedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let need: Need | null = null;
  let tasks: Task[] = [];
  let timeline: NeedTimelineEntry[] = [];
  let errorText = "";

  try {
    const [needRes, tasksRes, timelineRes] = await Promise.all([
      apiGet<NeedResponse>(`/needs/${id}`),
      apiGet<TasksResponse>(`/tasks?report_id=${id}`),
      apiGet<TimelineResponse>(`/needs/${id}/timeline`),
    ]);
    need = needRes.data;
    tasks = tasksRes.data;
    timeline = timelineRes.data;
  } catch (error) {
    errorText = error instanceof Error ? error.message : "Failed to load need details";
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold text-slate-900">Need Details</h1>
          <Link href="/reporter/my-reports" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
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
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Affected: {need.affected_count}</div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                Captured: {need.client_captured_at ? new Date(need.client_captured_at).toLocaleString() : "Not available"}
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                Proof images: {need.image_urls?.length ?? 0}
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="text-xs uppercase text-slate-500">Priority Analytics</p>
              <p className="mt-1 text-xs text-slate-600">Urgency: {need.urgency_score} · Confidence: {need.urgency_confidence ?? 0}%</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(need.urgency_reasons ?? []).map((reason) => (
                  <span key={`${reason.label}-${reason.points}`} className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 border border-slate-200">
                    {reason.label} ({reason.points >= 0 ? "+" : ""}{reason.points})
                  </span>
                ))}
              </div>
            </div>
            {need.image_urls?.length ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {need.image_urls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-200 p-2 text-xs text-slate-600 hover:bg-slate-50">
                    {url}
                  </a>
                ))}
              </div>
            ) : null}
            {need.status === "open" || need.status === "task_created" ? (
              <div className="mt-4">
                <Link href={`/reporter/tasks/new?report_id=${need.id}`} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                  Create Task For This Need
                </Link>
              </div>
            ) : null}
          </section>
        ) : null}

        <NeedTimeline entries={timeline} />

        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Tasks</h3>
          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">No tasks created yet.</div>
          ) : (
            tasks.map((task) => (
              <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/reporter/tasks/${task.id}`} className="font-semibold text-slate-900 underline-offset-2 hover:underline">
                    {task.title}
                  </Link>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{task.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{task.location_text}</p>
                <div className="mt-3">
                  <Link href={`/reporter/tasks/${task.id}`} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
                    View Task Details
                  </Link>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
