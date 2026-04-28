"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../../../../lib/api";

/* ── Types ────────────────────────────────────────────────── */
type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  approval_status?: string;
  report_id: string;
  location_text: string;
  required_skills: string[];
  estimated_hours: number | null;
  deadline: string;
  volunteer_slots: number;
  completion_note: string | null;
  completion_image_url: string | null;
  assigned_to: string | null;
  created_at: string;
  completed_at: string | null;
  assigned_volunteer: null | {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    skills: string[];
    location_text: string;
    active_tasks: number;
    max_tasks: number;
    total_deployments: number;
  };
  linked_need: null | {
    id: string;
    title: string;
    status: string;
    category: string;
    urgency_score: number;
    severity_self: string;
    affected_count: number;
    location_text: string;
    description: string | null;
  };
  events: Array<{
    id: string;
    actor_label: string;
    from_status: string | null;
    to_status: string;
    note: string | null;
    created_at: string;
  }>;
  participants: Array<{
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
      skills: string[];
    };
  }>;
};

type TaskResponse = { data: TaskDetail };

/* ── Helpers ──────────────────────────────────────────────── */
const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  open:        { label: "Open",        color: "bg-sky-100 text-sky-700",       dot: "bg-sky-500"      },
  assigned:    { label: "Assigned",    color: "bg-violet-100 text-violet-700", dot: "bg-violet-500"   },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700",   dot: "bg-amber-500"    },
  completed:   { label: "Completed",   color: "bg-blue-100 text-blue-700",     dot: "bg-blue-500"     },
  verified:    { label: "Verified ✓",  color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};

const EVENT_COLORS: Record<string, string> = {
  open:        "bg-sky-500",
  assigned:    "bg-violet-500",
  in_progress: "bg-amber-500",
  completed:   "bg-blue-500",
  verified:    "bg-emerald-500",
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.color}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function InfoCard({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
      <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{icon} {label}</p>
      <div className="font-semibold text-slate-800 text-sm">{value}</div>
    </div>
  );
}

function isOverdue(deadline: string, status: string): boolean {
  return !["completed", "verified"].includes(status) && new Date(deadline) < new Date();
}

/* ── Page ─────────────────────────────────────────────────── */
export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const taskId = params.id;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<"complete" | "verify" | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [showCompleteForm, setShowCompleteForm] = useState(false);

  const loadTask = useCallback(async () => {
    try {
      const response = await apiGet<TaskResponse>(`/tasks/${taskId}`);
      setTask(response.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load task");
    }
  }, [taskId]);

  useEffect(() => { if (taskId) void loadTask(); }, [taskId, loadTask]);

  async function completeTask() {
    setBusyAction("complete");
    try {
      await apiPost(`/tasks/${taskId}/complete`, {
        completion_note: completionNote || "Marked complete by coordinator",
        actor_label: "Coordinator",
      });
      setShowCompleteForm(false);
      await loadTask();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Complete failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function verifyTask() {
    setBusyAction("verify");
    try {
      await apiPost(`/tasks/${taskId}/verify`, {
        actor_label: "Coordinator",
        note: "Verified from coordinator dashboard",
      });
      await loadTask();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setBusyAction(null);
    }
  }

  if (!task) {
    return (
      <main className="min-h-screen px-6 py-12 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse text-sm">
          {error ? <span className="text-rose-600">{error}</span> : "Loading task…"}
        </div>
      </main>
    );
  }

  const overdue = isOverdue(task.deadline, task.status);
  const canComplete =
    task.status !== "completed" &&
    task.status !== "verified" &&
    busyAction === null;
  const canVerify = task.status === "completed" && busyAction === null;
  const allParticipantsDone =
    task.participants.length === 0 ||
    task.participants.every((p) => p.status === "completed");

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">

        {/* ── Top bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/coordinator/tasks" className="text-slate-400 hover:text-slate-700 transition-colors text-sm">
              ← All Tasks
            </Link>
            <span className="text-slate-200">/</span>
            <h1 className="text-2xl font-bold text-slate-900 truncate max-w-xs">{task.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={task.status} />
            {overdue && (
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">⚠ Overdue</span>
            )}
            <Link
              href={`/coordinator/tasks/${taskId}/matches`}
              className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              🎯 Find Volunteers
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* ── Main 2-col grid ── */}
        <div className="grid gap-5 lg:grid-cols-3">

          {/* LEFT — Task Details (2/3) */}
          <div className="lg:col-span-2 space-y-5">

            {/* Core info card */}
            <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 leading-snug">{task.title}</h2>
                  {task.description && (
                    <p className="mt-2 text-slate-600 text-sm leading-relaxed">{task.description}</p>
                  )}
                </div>
                <StatusBadge status={task.status} />
              </div>

              {/* Key metrics grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <InfoCard icon="📍" label="Location" value={task.location_text} />
                <InfoCard
                  icon="⏰"
                  label="Deadline"
                  value={
                    <span className={overdue ? "text-rose-600" : ""}>
                      {new Date(task.deadline).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                      })}
                      {overdue && " ⚠"}
                    </span>
                  }
                />
                <InfoCard
                  icon="⏱"
                  label="Estimated Hours"
                  value={task.estimated_hours != null ? `${task.estimated_hours}h` : "Not specified"}
                />
                <InfoCard
                  icon="👥"
                  label="Volunteer Slots"
                  value={`${task.participants.length} / ${task.volunteer_slots}`}
                />
                <InfoCard
                  icon="📅"
                  label="Created"
                  value={new Date(task.created_at).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric"
                  })}
                />
                {task.completed_at && (
                  <InfoCard
                    icon="✅"
                    label="Completed"
                    value={new Date(task.completed_at).toLocaleDateString("en-IN", {
                      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                    })}
                  />
                )}
              </div>

              {/* Required Skills */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">🛠 Required Skills</p>
                {task.required_skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {task.required_skills.map((skill) => (
                      <span key={skill} className="rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 capitalize">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No specific skills required.</p>
                )}
              </div>

              {/* Completion note if done */}
              {task.completion_note && (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                  <p className="text-xs font-semibold text-emerald-700 uppercase mb-1">✓ Completion Note</p>
                  <p className="text-sm text-emerald-800">{task.completion_note}</p>
                </div>
              )}
            </section>

            {/* Assigned Volunteers */}
            <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">👤 Assigned Volunteers</h3>
                <span className="text-sm text-slate-500">
                  {task.participants.filter((p) => p.status === "completed").length}/{task.participants.length} completed
                </span>
              </div>

              {task.participants.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 px-4 py-6 text-center">
                  <p className="text-slate-400 text-sm">No volunteers assigned yet.</p>
                  <Link
                    href={`/coordinator/tasks/${taskId}/matches`}
                    className="mt-3 inline-block rounded-full bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                  >
                    Find matching volunteers →
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {task.participants.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {(p.volunteer?.full_name ?? "V")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">
                              {p.volunteer?.full_name ?? p.volunteer_id}
                            </p>
                            <p className="text-xs text-slate-500">
                              {p.volunteer?.phone}{p.volunteer?.email ? ` · ${p.volunteer.email}` : ""}
                            </p>
                          </div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          p.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {p.status === "completed" ? "✓ Done" : "In Progress"}
                        </span>
                      </div>
                      {p.volunteer?.skills && p.volunteer.skills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {p.volunteer.skills.map((sk) => (
                            <span key={sk} className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-600 capitalize">
                              {sk}
                            </span>
                          ))}
                        </div>
                      )}
                      {p.completion_note && (
                        <div className="mt-2 rounded-xl bg-white border border-slate-200 px-3 py-2">
                          <p className="text-xs text-slate-400 mb-0.5">Completion note</p>
                          <p className="text-sm text-slate-700">{p.completion_note}</p>
                        </div>
                      )}
                      {p.completed_at && (
                        <p className="mt-1 text-xs text-slate-400">
                          Completed {new Date(p.completed_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Activity Timeline */}
            <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-900">📋 Activity Timeline</h3>
              <div className="relative">
                <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-slate-100" />
                <div className="space-y-4">
                  {task.events.map((ev, i) => {
                    const dotColor = EVENT_COLORS[ev.to_status] ?? "bg-slate-400";
                    return (
                      <div key={ev.id} className={`flex gap-4 ${i === task.events.length - 1 ? "" : ""}`}>
                        <div className="relative flex-shrink-0 w-7 flex justify-center">
                          <div className={`w-3 h-3 rounded-full mt-1.5 border-2 border-white shadow-sm ${dotColor}`} />
                        </div>
                        <div className="flex-1 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 pb-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              {ev.from_status && (
                                <>
                                  <StatusBadge status={ev.from_status} />
                                  <span className="text-slate-300 text-xs">→</span>
                                </>
                              )}
                              <StatusBadge status={ev.to_status} />
                            </div>
                            <span className="text-xs text-slate-400">
                              {new Date(ev.created_at).toLocaleString("en-IN", {
                                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                              })}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-slate-500 font-medium">{ev.actor_label}</p>
                          {ev.note && <p className="mt-1 text-sm text-slate-700">{ev.note}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT sidebar (1/3) */}
          <div className="space-y-5">

            {/* Actions card */}
            <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-900">⚡ Actions</h3>

              {/* Complete */}
              {canComplete && (
                <div>
                  {!showCompleteForm ? (
                    <button
                      onClick={() => setShowCompleteForm(true)}
                      disabled={!allParticipantsDone}
                      className="w-full rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                      Mark Task Complete
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        value={completionNote}
                        onChange={(e) => setCompletionNote(e.target.value)}
                        placeholder="Add completion note (optional)…"
                        rows={3}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={completeTask}
                          disabled={busyAction !== null}
                          className="flex-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
                        >
                          {busyAction === "complete" ? "Saving…" : "Confirm Complete"}
                        </button>
                        <button
                          onClick={() => setShowCompleteForm(false)}
                          className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {!allParticipantsDone && task.participants.length > 0 && (
                    <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      ⚠ Waiting for all assigned volunteers to complete their work.
                    </p>
                  )}
                </div>
              )}

              {/* Verify */}
              {canVerify && (
                <button
                  onClick={verifyTask}
                  disabled={busyAction !== null}
                  className="w-full rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {busyAction === "verify" ? "Verifying…" : "✓ Verify & Resolve Need"}
                </button>
              )}

              {/* Verified state */}
              {task.status === "verified" && (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-center">
                  <p className="text-sm font-semibold text-emerald-700">✓ Verified & Resolved</p>
                  <p className="text-xs text-emerald-600 mt-0.5">This task has been verified and the linked need is resolved.</p>
                </div>
              )}

              {task.status !== "verified" && task.status !== "completed" && (
                <Link
                  href={`/coordinator/tasks/${taskId}/matches`}
                  className="block w-full text-center rounded-full border border-indigo-300 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  🎯 Match Volunteers
                </Link>
              )}
            </section>

            {/* Linked Need */}
            {task.linked_need && (
              <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5 space-y-3">
                <h3 className="text-base font-bold text-slate-900">🔗 Linked Need</h3>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-2">
                  <p className="font-semibold text-slate-800 text-sm">{task.linked_need.title}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 uppercase">
                      {task.linked_need.category}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      task.linked_need.urgency_score >= 7 ? "bg-rose-100 text-rose-700" :
                      task.linked_need.urgency_score >= 4 ? "bg-amber-100 text-amber-700" :
                      "bg-emerald-100 text-emerald-700"
                    }`}>
                      Urgency {task.linked_need.urgency_score}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white border border-slate-100 px-2 py-1.5">
                      <p className="text-slate-400">Severity</p>
                      <p className="font-semibold text-slate-700 capitalize">{task.linked_need.severity_self}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-100 px-2 py-1.5">
                      <p className="text-slate-400">Affected</p>
                      <p className="font-semibold text-slate-700">{task.linked_need.affected_count}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">📍 {task.linked_need.location_text}</p>
                  {task.linked_need.description && (
                    <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-2">
                      {task.linked_need.description}
                    </p>
                  )}
                  <Link
                    href={`/coordinator/needs/${task.linked_need.id}`}
                    className="block text-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    View Need Details →
                  </Link>
                </div>
              </section>
            )}

            {/* Quick stats */}
            <section className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5 space-y-3">
              <h3 className="text-base font-bold text-slate-900">📊 Task Stats</h3>
              <div className="space-y-2">
                {[
                  { label: "Total slots",       value: task.volunteer_slots },
                  { label: "Volunteers assigned", value: task.participants.length },
                  { label: "Completed",          value: task.participants.filter((p) => p.status === "completed").length },
                  { label: "Skills required",    value: task.required_skills.length || "None" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold text-slate-800">{value}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
