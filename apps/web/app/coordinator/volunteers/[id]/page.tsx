import Link from "next/link";
import { apiGet, type Need, type Task, type Volunteer, type VolunteerRequest } from "../../../../lib/api";

type VolunteersResponse = { data: Volunteer[] };
type TasksResponse = { data: Task[] };
type NeedsResponse = { data: Need[] };
type VolunteerRequestsResponse = { data: VolunteerRequest[] };

export const dynamic = "force-dynamic";

export default async function CoordinatorVolunteerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let volunteer: Volunteer | null = null;
  let assignedTasks: Task[] = [];
  let requests: VolunteerRequest[] = [];
  let createdNeeds: Need[] = [];
  let relatedTasksFromNeeds: Task[] = [];
  let errorText = "";

  try {
    const [volunteerRes, taskRes, requestRes] = await Promise.all([
      apiGet<VolunteersResponse>("/volunteers"),
      apiGet<TasksResponse>(`/tasks?volunteer_id=${id}`),
      apiGet<VolunteerRequestsResponse>(`/volunteer-requests?volunteer_id=${id}`),
    ]);

    volunteer = volunteerRes.data.find((v) => v.id === id) ?? null;
    assignedTasks = taskRes.data ?? [];
    requests = requestRes.data ?? [];

    if (volunteer?.clerk_id) {
      const needsRes = await apiGet<NeedsResponse>(`/needs?reporter_clerk_id=${volunteer.clerk_id}`);
      createdNeeds = needsRes.data ?? [];
      const tasksByNeedRes = await Promise.all(
        createdNeeds.map((need) => apiGet<TasksResponse>(`/tasks?report_id=${need.id}`))
      );
      relatedTasksFromNeeds = tasksByNeedRes.flatMap((res) => res.data ?? []);
    }
  } catch (error) {
    errorText = error instanceof Error ? error.message : "Failed to load volunteer profile";
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold text-slate-900">Volunteer Full Profile</h1>
          <Link href="/coordinator/volunteers" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            Back
          </Link>
        </div>

        {errorText ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorText}</div> : null}

        {volunteer ? (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-xl font-semibold text-slate-900">{volunteer.full_name}</h2>
              <p className="mt-1 text-sm text-slate-600">{volunteer.email ?? "No email"} · {volunteer.phone}</p>
              <p className="mt-1 text-sm text-slate-600">{volunteer.location_text}</p>
              <p className="mt-1 text-xs text-slate-400">Clerk ID: {volunteer.clerk_id ?? "Not linked"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(volunteer.skills ?? []).map((skill) => (
                  <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{skill}</span>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-semibold text-slate-900">Assigned Tasks ({assignedTasks.length})</h3>
              <div className="mt-3 space-y-2">
                {assignedTasks.length === 0 ? (
                  <p className="text-sm text-slate-500">No assigned tasks.</p>
                ) : (
                  assignedTasks.map((task) => (
                    <div key={task.id} className="rounded-xl border border-slate-200 p-3">
                      <p className="font-medium text-slate-900">{task.title}</p>
                      <p className="text-sm text-slate-600">{task.location_text}</p>
                      <p className="text-xs text-slate-500">Status: {task.status}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-semibold text-slate-900">Participation Requests ({requests.length})</h3>
              <div className="mt-3 space-y-2">
                {requests.length === 0 ? (
                  <p className="text-sm text-slate-500">No participation requests.</p>
                ) : (
                  requests.map((request) => (
                    <div key={request.id} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-sm text-slate-700">
                        {request.task_id ? `Task Request: ${request.task_id}` : `Need Request: ${request.need_id}`}
                      </p>
                      <p className="text-xs text-slate-500">Status: {request.status}</p>
                      {request.coordinator_note ? <p className="text-xs text-slate-500">Coordinator note: {request.coordinator_note}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-semibold text-slate-900">Needs Created By This Volunteer Account ({createdNeeds.length})</h3>
              <div className="mt-3 space-y-2">
                {createdNeeds.length === 0 ? (
                  <p className="text-sm text-slate-500">No needs found with this volunteer account as reporter.</p>
                ) : (
                  createdNeeds.map((need) => (
                    <div key={need.id} className="rounded-xl border border-slate-200 p-3">
                      <p className="font-medium text-slate-900">{need.title}</p>
                      <p className="text-sm text-slate-600">{need.location_text}</p>
                      <p className="text-xs text-slate-500">Status: {need.status}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-semibold text-slate-900">Tasks Generated From Those Needs ({relatedTasksFromNeeds.length})</h3>
              <div className="mt-3 space-y-2">
                {relatedTasksFromNeeds.length === 0 ? (
                  <p className="text-sm text-slate-500">No tasks generated from those needs.</p>
                ) : (
                  relatedTasksFromNeeds.map((task) => (
                    <div key={task.id} className="rounded-xl border border-slate-200 p-3">
                      <p className="font-medium text-slate-900">{task.title}</p>
                      <p className="text-sm text-slate-600">{task.location_text}</p>
                      <p className="text-xs text-slate-500">Status: {task.status}</p>
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
