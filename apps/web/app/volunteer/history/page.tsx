"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { apiGet, type Task, type Volunteer } from "../../../lib/api";

type VolunteersResponse = { data: Volunteer[] };
type TasksResponse = { data: Task[] };

export default function VolunteerHistoryPage() {
  const { userId, isLoaded } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (!isLoaded || !userId) return;
    async function load() {
      setLoading(true);
      setErrorText("");
      try {
        const volunteerRes = await apiGet<VolunteersResponse>(`/volunteers?clerk_id=${userId}`);
        const volunteer = volunteerRes.data[0];
        if (!volunteer) {
          setTasks([]);
          return;
        }
        const taskRes = await apiGet<TasksResponse>(`/tasks?volunteer_id=${volunteer.id}`);
        setTasks(
          taskRes.data.filter(
            (task) =>
              task.participant_status === "completed" || task.status === "completed" || task.status === "verified"
          )
        );
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : "Failed to load history");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [isLoaded, userId]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-slate-900">Task History</h1>
      {errorText ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorText}</div>
      ) : null}
      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : tasks.length === 0 ? (
        <p className="text-slate-500">No completed tasks yet.</p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-slate-900">{task.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{task.location_text}</p>
              <p className="mt-2 text-xs text-slate-500">
                Status: {task.status.replace("_", " ")}
                {task.participant_completed_at ? ` · You completed: ${new Date(task.participant_completed_at).toLocaleString()}` : ""}
              </p>
              {task.participant_completion_note ? (
                <p className="mt-2 text-sm text-slate-600">Your note: {task.participant_completion_note}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
