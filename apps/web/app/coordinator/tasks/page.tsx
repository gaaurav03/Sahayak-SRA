"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet, type Task } from "../../../lib/api";

type TasksResponse = { data: Task[] };

export default function CoordinatorTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorText("");
      try {
        const res = await apiGet<TasksResponse>("/tasks");
        setTasks(res.data);
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : "Failed to load tasks");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-slate-900">All Tasks</h1>
        <p className="mt-1 text-sm text-slate-500">View all tasks created by field reporters and current volunteer progress.</p>
      </header>

      {errorText ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorText}</div> : null}

      {loading ? (
        <div className="py-12 text-slate-500">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-500">No tasks found.</div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{task.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{task.location_text}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{task.status}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Link href={`/coordinator/tasks/${task.id}`} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700">
                  View Task
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
