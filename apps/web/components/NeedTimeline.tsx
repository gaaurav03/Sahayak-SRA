import type { NeedTimelineEntry } from "../lib/api";

const TYPE_STYLES: Record<NeedTimelineEntry["type"], { label: string; chip: string }> = {
  created: { label: "Created", chip: "bg-sky-100 text-sky-700" },
  approved: { label: "Approved", chip: "bg-emerald-100 text-emerald-700" },
  task_created: { label: "Tasks", chip: "bg-purple-100 text-purple-700" },
  assigned: { label: "Assigned", chip: "bg-amber-100 text-amber-700" },
  completed: { label: "Completed", chip: "bg-teal-100 text-teal-700" },
  verified: { label: "Verified", chip: "bg-slate-200 text-slate-700" },
};

export default function NeedTimeline({ entries }: { entries: NeedTimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-slate-900">Activity Timeline</h3>
        <p className="mt-2 text-sm text-slate-500">No activity recorded yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Activity Timeline</h3>
          <p className="mt-1 text-sm text-slate-500">Created, approved, tasks, assigned, completed, and verified events.</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {entries.map((entry) => {
          const style = TYPE_STYLES[entry.type];
          return (
            <div key={`${entry.type}-${entry.timestamp ?? entry.title}-${entry.task_id ?? "none"}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style.chip}`}>{style.label}</span>
                  <p className="text-sm font-medium text-slate-800">{entry.title}</p>
                </div>
                <span className="text-xs text-slate-500">
                  {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "No timestamp"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                {entry.actor_label ? <span>Actor: {entry.actor_label}</span> : null}
                {entry.task_title ? <span>Task: {entry.task_title}</span> : null}
              </div>
              {entry.note ? <p className="mt-2 text-sm text-slate-600">{entry.note}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
