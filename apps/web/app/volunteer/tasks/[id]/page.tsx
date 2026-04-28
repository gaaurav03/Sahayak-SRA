import Link from "next/link";
import { apiGet } from "../../../../lib/api";

type TaskDetail = {
  id: string;
  title: string;
  description: string;
  status: string;
  deadline: string;
  location_text: string;
  required_skills: string[];
  estimated_hours: number | null;
  volunteer_slots: number;
  linked_need: null | {
    id: string;
    title: string;
    status: string;
    description: string;
  };
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
    };
  }>;
};

type TaskResponse = { data: TaskDetail };

export const dynamic = "force-dynamic";

export default async function VolunteerTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let task: TaskDetail | null = null;
  let errorText = "";

  try {
    const res = await apiGet<TaskResponse>(`/tasks/${id}`);
    task = res.data;
  } catch (error) {
    errorText = error instanceof Error ? error.message : "Failed to load task";
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold text-slate-900">Task Details</h1>
          <Link href="/volunteer/tasks" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Back
          </Link>
        </div>

        {errorText ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorText}</div>
        ) : null}

        {task ? (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-6">
              <h2 className="text-2xl font-semibold text-slate-900">{task.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{task.description || "No description provided."}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Status: {task.status}</div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Deadline: {new Date(task.deadline).toLocaleString()}</div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Location: {task.location_text}</div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Estimated Hours: {task.estimated_hours ?? "N/A"}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {task.required_skills.map((skill) => (
                  <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{skill}</span>
                ))}
              </div>
            </section>

            {task.linked_need ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">Linked Need</h3>
                <p className="mt-1 text-sm text-slate-700">{task.linked_need.title}</p>
                <p className="mt-1 text-sm text-slate-600">{task.linked_need.description}</p>
                <p className="mt-2 text-xs text-slate-500">Need status: {task.linked_need.status}</p>
                <Link href={`/volunteer/needs/${task.linked_need.id}`} className="mt-3 inline-block rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700">
                  View Need Details
                </Link>
              </section>
            ) : null}

            <section className="rounded-3xl border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-semibold text-slate-900">Volunteer Progress</h3>
              <div className="mt-3 space-y-2">
                {task.participants.length === 0 ? (
                  <p className="text-sm text-slate-500">No volunteer assignments yet.</p>
                ) : (
                  task.participants.map((participant) => (
                    <div key={participant.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-800">{participant.volunteer?.full_name ?? participant.volunteer_id}</p>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${participant.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {participant.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
