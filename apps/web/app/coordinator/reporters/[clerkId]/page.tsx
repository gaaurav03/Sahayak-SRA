import Link from "next/link";
import { apiGet, type Need, type Task, type UserProfile } from "../../../../lib/api";

type UsersResponse = { data: UserProfile[] };
type NeedsResponse = { data: Need[] };
type TasksResponse = { data: Task[] };

export const dynamic = "force-dynamic";

export default async function CoordinatorReporterDetailPage({ params }: { params: Promise<{ clerkId: string }> }) {
  const { clerkId } = await params;
  let reporter: UserProfile | null = null;
  let needs: Need[] = [];
  let tasksFromNeeds: Task[] = [];
  let errorText = "";

  try {
    const [userRes, needsRes] = await Promise.all([
      apiGet<UsersResponse>(`/users?clerk_id=${clerkId}`),
      apiGet<NeedsResponse>(`/needs?reporter_clerk_id=${clerkId}`),
    ]);
    reporter = userRes.data[0] ?? null;
    needs = needsRes.data ?? [];

    const taskResponses = await Promise.all(
      needs.map((need) => apiGet<TasksResponse>(`/tasks?report_id=${need.id}`))
    );
    tasksFromNeeds = taskResponses.flatMap((r) => r.data ?? []);
  } catch (error) {
    errorText = error instanceof Error ? error.message : "Failed to load reporter profile";
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold text-slate-900">Reporter Full Profile</h1>
          <Link href="/coordinator/reporters" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Back
          </Link>
        </div>

        {errorText ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorText}</div> : null}

        {reporter ? (
          <>
            {/* ── Reporter Info Card ── */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {reporter.full_name[0]?.toUpperCase() ?? "R"}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{reporter.full_name}</h2>
                  <p className="text-sm text-slate-500">{reporter.email ?? "No email"}{reporter.phone ? ` · ${reporter.phone}` : ""}</p>
                </div>
              </div>
            </section>

            {/* ── Needs & Tasks (nested) ── */}
            <section className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Needs & Tasks ({needs.length})</h3>
              </div>

              {needs.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-400">
                  This reporter hasn&apos;t submitted any needs yet.
                </div>
              ) : (
                <div className="space-y-5">
                  {needs.map((need) => {
                    const needTasks = tasksFromNeeds.filter((t) => t.report_id === need.id);

                    return (
                      <article key={need.id} className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                        {/* ── Need header ── */}
                        <div className="p-6 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                  {need.category}
                                </span>
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  need.urgency_score >= 7 ? "bg-rose-100 text-rose-700" :
                                  need.urgency_score >= 4 ? "bg-amber-100 text-amber-700" :
                                  "bg-emerald-100 text-emerald-700"
                                }`}>
                                  Urgency {need.urgency_score}
                                </span>
                              </div>
                              <h4 className="text-lg font-bold text-slate-900">{need.title}</h4>
                              <p className="text-sm text-slate-500">📍 {need.location_text}</p>
                              {need.description && (
                                <p className="text-sm text-slate-600 mt-1">{need.description}</p>
                              )}
                              <p className="text-xs text-slate-400">
                                Submitted {new Date(need.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                            </div>

                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                                need.status === "resolved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                need.status === "task_completed" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                need.status === "task_created" ? "bg-purple-50 text-purple-700 border-purple-200" :
                                need.status === "open" ? "bg-sky-50 text-sky-700 border-sky-200" :
                                "bg-amber-50 text-amber-700 border-amber-200"
                              }`}>
                                {need.status === "resolved" ? "✓ Resolved" :
                                 need.status === "task_completed" ? "✓ Task Completed" :
                                 need.status === "task_created" ? "Task in Progress" :
                                 need.status === "open" ? "Open" :
                                 need.status.replace("_", " ")}
                              </span>
                              <Link href={`/coordinator/needs/${need.id}`} className="text-xs font-semibold text-indigo-600 hover:underline">
                                View Need →
                              </Link>
                            </div>
                          </div>
                        </div>

                        {/* ── Child tasks ── */}
                        <div className="p-6">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                            Generated Tasks ({needTasks.length})
                          </p>

                          {needTasks.length === 0 ? (
                            <p className="text-sm text-slate-400 italic">No tasks created for this need yet.</p>
                          ) : (
                            <div className="space-y-3">
                              {needTasks.map((task) => (
                                <div key={task.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-colors">
                                  <div className="flex items-start gap-3">
                                    <span className="text-slate-300 mt-0.5">↳</span>
                                    <div>
                                      <p className="font-semibold text-slate-800 text-sm">{task.title}</p>
                                      <div className="flex flex-wrap items-center gap-2 mt-1">
                                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                          task.status === "verified" ? "bg-emerald-100 text-emerald-700" :
                                          task.status === "completed" ? "bg-blue-100 text-blue-700" :
                                          task.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                                          "bg-sky-100 text-sky-700"
                                        }`}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${
                                            task.status === "verified" ? "bg-emerald-500" :
                                            task.status === "completed" ? "bg-blue-500" :
                                            task.status === "in_progress" ? "bg-amber-500" :
                                            "bg-sky-500"
                                          }`} />
                                          {task.status === "verified" ? "Verified ✓" :
                                           task.status === "completed" ? "Completed" :
                                           task.status === "in_progress" ? "In Progress" :
                                           "Open"}
                                        </span>
                                        <span className="text-xs text-slate-400">📍 {task.location_text}</span>
                                        {task.deadline && (
                                          <span className="text-xs text-slate-400">
                                            Due {new Date(task.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <Link
                                    href={`/coordinator/tasks/${task.id}`}
                                    className="flex-shrink-0 rounded-full bg-white border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors shadow-sm"
                                  >
                                    Manage Task
                                  </Link>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
