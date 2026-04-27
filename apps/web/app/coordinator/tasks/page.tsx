import Link from "next/link";
import { apiGet, type Task } from "../../../lib/api";

type TasksResponse = { data: Task[] };

const STATUS_STYLES: Record<string, string> = {
  open: "bg-sky-100 text-sky-700",
  assigned: "bg-amber-100 text-amber-700",
  in_progress: "bg-purple-100 text-purple-700",
  completed: "bg-emerald-100 text-emerald-700",
  verified: "bg-slate-100 text-slate-700",
};

export const dynamic = "force-dynamic";

export default async function AllTasksPage() {
  let tasks: Task[] = [];
  let errorText = "";

  try {
    const response = await apiGet<TasksResponse>("/tasks");
    tasks = response.data;
  } catch (error) {
    errorText = error instanceof Error ? error.message : "Failed to load tasks";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-slate-900">All Tasks</h1>
          <p className="text-slate-500 text-sm mt-1">Track and manage every task across all needs.</p>
        </div>
        <Link
          href="/coordinator/needs"
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
        >
          + Create Task
        </Link>
      </div>

      {errorText ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorText}
        </div>
      ) : null}

      {tasks.length === 0 && !errorText ? (
        <div className="rounded-3xl border border-slate-200 bg-white/70 p-12 text-center">
          <p className="text-slate-500 text-lg mb-2">No tasks yet.</p>
          <p className="text-slate-400 text-sm mb-6">Go to the Needs Dashboard, open a need, and click &quot;Create Task&quot;.</p>
          <Link
            href="/coordinator/needs"
            className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white"
          >
            Go to Needs Dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Link
              key={task.id}
              href={`/coordinator/tasks/${task.id}`}
              className="block glass rounded-2xl p-5 soft-ring hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{task.title}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{task.location_text}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                    STATUS_STYLES[task.status] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {task.status.replace("_", " ")}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {task.required_skills.map((skill) => (
                  <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                    {skill}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>Deadline: {new Date(task.deadline).toLocaleString()}</span>
                <span>
                  {task.assigned_to ? "✓ Assigned" : "Unassigned"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
