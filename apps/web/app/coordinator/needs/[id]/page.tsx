import Link from "next/link";
import NeedTimeline from "../../../../components/NeedTimeline";
import { apiGet, type Need, type NeedTimelineEntry } from "../../../../lib/api";

type NeedResponse = { data: Need };
type TaskRow = {
  id: string;
  title: string;
  status: string;
  deadline: string;
  location_text: string;
  participants?: Array<{
    id: string;
    volunteer_id: string;
    status: "assigned" | "completed";
    completion_note: string | null;
    completed_at: string | null;
    volunteer: null | {
      id: string;
      full_name: string;
      phone: string;
      email: string | null;
    };
  }>;
};
type TasksResponse = { data: TaskRow[] };
type TaskDetailResponse = { data: TaskRow };
type TimelineResponse = { data: NeedTimelineEntry[] };

export const dynamic = "force-dynamic";

export default async function NeedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let need: Need | null = null;
  let tasks: TaskRow[] = [];
  let timeline: NeedTimelineEntry[] = [];
  let errorText = "";

  try {
    const [needRes, timelineRes] = await Promise.all([
      apiGet<NeedResponse>(`/needs/${id}`),
      apiGet<TimelineResponse>(`/needs/${id}/timeline`),
    ]);
    need = needRes.data;
    timeline = timelineRes.data;

    const tasksRes = await apiGet<TasksResponse>(`/tasks?report_id=${id}`);
    const detailRows = await Promise.all(
      tasksRes.data.map(async (task) => {
        const detail = await apiGet<TaskDetailResponse>(`/tasks/${task.id}`);
        return detail.data;
      })
    );
    tasks = detailRows;
  } catch (error) {
    errorText = error instanceof Error ? error.message : "Failed to load need details";
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold text-slate-900">Need Details</h1>
          <Link href="/coordinator/needs" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Back to Needs
          </Link>
        </div>

        {errorText ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorText}</div>
        ) : null}

        {need ? (
          <section className="glass rounded-3xl p-6 soft-ring">
            <h2 className="text-2xl font-semibold text-slate-900">{need.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{need.description}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-700">
                <span className="block text-xs text-slate-400 uppercase mb-1">Status</span>
                {need.status === "pending" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Pending Review</span>}
                {need.status === "open" && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">Open</span>}
                {need.status === "task_created" && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">Task in Progress</span>}
                {need.status === "task_completed" && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">✓ Task Completed</span>}
                {need.status === "resolved" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">✓ Resolved</span>}
                {need.status === "rejected" && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Rejected</span>}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-700">Category: {need.category}</div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-700">Urgency: {need.urgency_score}</div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-700">Location: {need.location_text}</div>
            </div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-700">
              <p className="text-xs uppercase text-slate-500">Priority Explainability</p>
              <p className="mt-1 text-xs text-slate-600">Confidence: {need.urgency_confidence ?? 0}%</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(need.urgency_reasons ?? []).map((reason) => (
                  <span key={`${reason.label}-${reason.points}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {reason.label} ({reason.points >= 0 ? "+" : ""}{reason.points})
                  </span>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <NeedTimeline entries={timeline} />

        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Tasks for this Need</h3>
          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">No tasks created for this need yet.</div>
          ) : (
            tasks.map((task) => (
              <article key={task.id} className="glass rounded-3xl p-6 soft-ring">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xl font-semibold text-slate-900">{task.title}</h4>
                    <p className="text-sm text-slate-500">{task.location_text}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{task.status}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">Deadline: {new Date(task.deadline).toLocaleString()}</p>

                <div className="mt-4 space-y-2">
                  <p className="text-sm font-semibold text-slate-700">Assigned Volunteers</p>
                  {(task.participants ?? []).length === 0 ? (
                    <p className="text-sm text-slate-500">No volunteers assigned.</p>
                  ) : (
                    (task.participants ?? []).map((participant) => (
                      <div key={participant.id} className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-800">
                            {participant.volunteer?.full_name ?? participant.volunteer_id}
                          </p>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              participant.status === "completed"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {participant.status}
                          </span>
                        </div>
                        {participant.completion_note ? (
                          <p className="mt-1 text-xs text-slate-500">Note: {participant.completion_note}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
