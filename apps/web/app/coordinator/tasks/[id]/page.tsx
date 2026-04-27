"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../../../../lib/api";

type TaskDetail = {
  id: string;
  title: string;
  status: string;
  report_id: string;
  completion_note: string | null;
  assigned_to: string | null;
  assigned_volunteer: null | {
    id: string;
    full_name: string;
    phone: string;
  };
  linked_need: null | {
    id: string;
    title: string;
    status: string;
  };
  events: Array<{
    id: string;
    actor_label: string;
    from_status: string | null;
    to_status: string;
    note: string | null;
    created_at: string;
  }>;
};

type TaskResponse = { data: TaskDetail };

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const taskId = params.id;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<"complete" | "verify" | null>(null);

  const loadTask = useCallback(async () => {
    try {
      const response = await apiGet<TaskResponse>(`/tasks/${taskId}`);
      setTask(response.data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load task");
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId) void loadTask();
  }, [taskId, loadTask]);

  async function completeTask() {
    setBusyAction("complete");
    try {
      await apiPost(`/tasks/${taskId}/complete`, {
        completion_note: "Completed via MVP task detail page",
        actor_label: "Volunteer",
      });
      await loadTask();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Complete failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function verifyTask() {
    setBusyAction("verify");
    try {
      await apiPost(`/tasks/${taskId}/verify`, {
        actor_label: "Coordinator",
        note: "Verified from MVP dashboard",
      });
      await loadTask();
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Verify failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-3xl font-semibold text-slate-900">Task Detail</h1>
          <div className="flex gap-3">
            <Link href={`/coordinator/tasks/${taskId}/matches`} className="text-sm font-semibold text-slate-600 underline">
              Matches
            </Link>
            <Link href="/coordinator/needs" className="text-sm font-semibold text-slate-600 underline">
              Dashboard
            </Link>
          </div>
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        {task ? (
          <>
            <section className="glass rounded-3xl p-6 soft-ring">
              <h2 className="text-xl font-semibold text-slate-900">{task.title}</h2>
              <p className="mt-2 text-sm text-slate-600">Status: {task.status}</p>
              <p className="mt-1 text-sm text-slate-600">
                Assigned volunteer: {task.assigned_volunteer?.full_name ?? "Not assigned"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Linked need status: {task.linked_need?.status ?? "Unknown"}
              </p>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={completeTask}
                  disabled={!task.assigned_to || task.status === "completed" || task.status === "verified" || busyAction !== null}
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busyAction === "complete" ? "Marking..." : "Mark Complete"}
                </button>
                <button
                  onClick={verifyTask}
                  disabled={task.status !== "completed" || busyAction !== null}
                  className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  {busyAction === "verify" ? "Verifying..." : "Verify"}
                </button>
              </div>
            </section>

            <section className="glass rounded-3xl p-6 soft-ring">
              <h3 className="text-lg font-semibold text-slate-900">Task Events</h3>
              <div className="mt-4 space-y-3">
                {task.events.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <p className="text-sm font-semibold text-slate-800">
                      {event.from_status ?? "(start)"} → {event.to_status}
                    </p>
                    <p className="text-xs text-slate-500">{event.actor_label} • {new Date(event.created_at).toLocaleString()}</p>
                    <p className="mt-1 text-sm text-slate-600">{event.note || "No note"}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <p className="text-slate-600">Loading task...</p>
        )}
      </div>
    </main>
  );
}
