import { apiGet, type Need, type Task, type Volunteer } from "../../../lib/api";

type TasksResponse = { data: Task[] };
type NeedsResponse = { data: Need[] };
type VolunteersResponse = { data: Volunteer[] };

export const dynamic = "force-dynamic";

async function fetchStats() {
  const [tasksRes, needsRes, volunteersRes] = await Promise.allSettled([
    apiGet<TasksResponse>("/tasks"),
    apiGet<NeedsResponse>("/needs"),
    apiGet<VolunteersResponse>("/volunteers"),
  ]);

  const tasks = tasksRes.status === "fulfilled" ? tasksRes.value.data : [];
  const needs = needsRes.status === "fulfilled" ? needsRes.value.data : [];
  const volunteers = volunteersRes.status === "fulfilled" ? volunteersRes.value.data : [];

  return { tasks, needs, volunteers };
}

export default async function AnalyticsPage() {
  const { tasks, needs, volunteers } = await fetchStats();

  const tasksByStatus = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  const needsByStatus = needs.reduce<Record<string, number>>((acc, n) => {
    acc[n.status] = (acc[n.status] ?? 0) + 1;
    return acc;
  }, {});

  const activeVolunteers = volunteers.filter((v) => v.is_active).length;
  const avgUrgency =
    needs.length > 0
      ? (needs.reduce((sum, n) => sum + n.urgency_score, 0) / needs.length).toFixed(1)
      : "—";

  const completionRate =
    tasks.length > 0
      ? Math.round(((tasksByStatus["verified"] ?? 0) + (tasksByStatus["completed"] ?? 0)) / tasks.length * 100)
      : 0;

  const statCards = [
    { label: "Total Needs", value: needs.length, color: "bg-sky-50 border-sky-200 text-sky-700" },
    { label: "Total Tasks", value: tasks.length, color: "bg-purple-50 border-purple-200 text-purple-700" },
    { label: "Active Volunteers", value: activeVolunteers, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    { label: "Avg Urgency Score", value: avgUrgency, color: "bg-amber-50 border-amber-200 text-amber-700" },
    { label: "Completion Rate", value: `${completionRate}%`, color: "bg-rose-50 border-rose-200 text-rose-700" },
    { label: "Open Needs", value: needsByStatus["open"] ?? 0, color: "bg-slate-50 border-slate-200 text-slate-700" },
  ];

  const STATUS_LABELS: Record<string, string> = {
    open: "Open",
    assigned: "Assigned",
    in_progress: "In Progress",
    completed: "Completed",
    verified: "Verified",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-slate-900">Analytics</h1>
        <p className="text-slate-500 text-sm mt-1">Platform overview and key metrics.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className={`rounded-2xl border p-5 ${card.color}`}>
            <p className="text-xs uppercase tracking-wide font-semibold opacity-70">{card.label}</p>
            <p className="text-4xl font-bold mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Tasks by Status */}
      <div className="glass rounded-3xl p-6 soft-ring">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Tasks by Status</h2>
        {tasks.length === 0 ? (
          <p className="text-slate-400 text-sm">No tasks yet.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(tasksByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-slate-600 capitalize">
                  {STATUS_LABELS[status] ?? status}
                </span>
                <div className="flex-1 bg-slate-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-slate-700 transition-all"
                    style={{ width: `${Math.round((count / tasks.length) * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-slate-700 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Needs by Status */}
      <div className="glass rounded-3xl p-6 soft-ring">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Needs by Status</h2>
        {needs.length === 0 ? (
          <p className="text-slate-400 text-sm">No needs yet.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(needsByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-slate-600 capitalize">
                  {status.replace("_", " ")}
                </span>
                <div className="flex-1 bg-slate-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-sky-500 transition-all"
                    style={{ width: `${Math.round((count / needs.length) * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-slate-700 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
