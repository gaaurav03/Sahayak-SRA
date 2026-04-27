"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet, apiPost, type MatchResult, type Task } from "../../../../../lib/api";

type MatchResponse = { data: MatchResult[] };
type TaskResponse = { data: Task };

export default function TaskMatchesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const taskId = params.id;

  const [task, setTask] = useState<Task | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [error, setError] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [taskResult, matchesResult] = await Promise.all([
          apiGet<TaskResponse>(`/tasks/${taskId}`),
          apiGet<MatchResponse>(`/tasks/${taskId}/matches`),
        ]);
        setTask(taskResult.data);
        setMatches(matchesResult.data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load matches");
      }
    }

    if (taskId) void load();
  }, [taskId]);

  async function assign(volunteerId: string) {
    setAssigning(volunteerId);
    setError("");
    try {
      await apiPost(`/tasks/${taskId}/assign`, {
        volunteer_id: volunteerId,
        actor_label: "Coordinator",
      });
      router.push(`/coordinator/tasks/${taskId}`);
      router.refresh();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Assignment failed");
    } finally {
      setAssigning(null);
    }
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-3xl font-semibold text-slate-900">Top Volunteer Matches</h1>
            <p className="text-slate-600">Task: {task?.title ?? taskId}</p>
          </div>
          <Link href={`/coordinator/tasks/${taskId}`} className="text-sm font-semibold text-slate-600 underline">
            View Task
          </Link>
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <section className="space-y-4">
          {matches.map((m, index) => (
            <article key={m.volunteer.id} className="glass rounded-3xl p-6 soft-ring">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-semibold text-slate-900">
                  #{index + 1} {m.volunteer.full_name}
                </h2>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Score {Math.round(m.totalScore * 100)}%
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{m.volunteer.location_text}</p>
              <p className="mt-2 text-sm text-slate-700">Skills: {m.volunteer.skills.join(", ") || "None"}</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-5">
                <span>Skill: {m.skillScore}</span>
                <span>Proximity: {m.proximityScore}</span>
                <span>Availability: {m.availScore}</span>
                <span>Workload: {m.workloadScore}</span>
                <span>Distance: {m.distanceKm ?? "N/A"}</span>
              </div>
              <button
                onClick={() => assign(m.volunteer.id)}
                disabled={assigning === m.volunteer.id}
                className="mt-4 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {assigning === m.volunteer.id ? "Assigning..." : "Assign"}
              </button>
            </article>
          ))}

          {matches.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-6 text-slate-600">
              No eligible volunteers found.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
