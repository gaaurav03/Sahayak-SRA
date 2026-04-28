"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiGet,
  apiPost,
  type Need,
  type Task,
  type TaskRecommendation,
  type Volunteer,
  type VolunteerRequest,
} from "../../../lib/api";

type VolunteersResponse = { data: Volunteer[] };
type NeedsResponse = { data: Need[] };
type TasksResponse = { data: Task[] };
type RequestsResponse = { data: VolunteerRequest[] };
type RecommendationResponse = { data: TaskRecommendation[] };

type TabKey = "recommended" | "assigned" | "tasks" | "needs" | "requests";

function statusTone(status: VolunteerRequest["status"]) {
  if (status === "approved") return "bg-emerald-100 text-emerald-700";
  if (status === "rejected") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

function TabButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/20 text-white" : "bg-white text-slate-600"}`}>
        {count}
      </span>
    </button>
  );
}

export default function VolunteerTasksPage() {
  const { userId, isLoaded } = useAuth();
  const [application, setApplication] = useState<Volunteer | null>(null);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
  const [recommendedTasks, setRecommendedTasks] = useState<TaskRecommendation[]>([]);
  const [requests, setRequests] = useState<VolunteerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("recommended");

  const loadAll = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setErrorText("");
    try {
      const volunteerRes = await apiGet<VolunteersResponse>(`/volunteers?clerk_id=${userId}`);
      const volunteer = volunteerRes.data[0] ?? null;
      setApplication(volunteer);

      const [needsRes, tasksRes] = await Promise.all([
        apiGet<NeedsResponse>("/needs?status=open,task_created"),
        apiGet<TasksResponse>("/tasks?status=open&approval_status=approved"),
      ]);
      setNeeds(needsRes.data);
      setTasks(tasksRes.data);

      if (volunteer) {
        const [reqRes, assignedRes, recommendationRes] = await Promise.all([
          apiGet<RequestsResponse>(`/volunteer-requests?volunteer_id=${volunteer.id}`),
          apiGet<TasksResponse>(`/tasks?volunteer_id=${volunteer.id}`),
          apiGet<RecommendationResponse>(`/tasks/recommended?volunteer_id=${volunteer.id}`),
        ]);
        setRequests(reqRes.data);
        setAssignedTasks(assignedRes.data);
        setRecommendedTasks(recommendationRes.data);
      } else {
        setRequests([]);
        setAssignedTasks([]);
        setRecommendedTasks([]);
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Failed to load volunteer causes");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!isLoaded || !userId) return;
    void loadAll();
  }, [isLoaded, userId, loadAll]);

  const requestKeys = useMemo(() => {
    const set = new Set<string>();
    for (const req of requests) {
      if (req.need_id) set.add(`need:${req.need_id}:${req.status}`);
      if (req.task_id) set.add(`task:${req.task_id}:${req.status}`);
    }
    return set;
  }, [requests]);

  async function requestParticipation(target: { needId?: string; taskId?: string }) {
    if (!application) return;
    const key = target.taskId ? `task:${target.taskId}` : `need:${target.needId}`;
    setBusyKey(key);
    setErrorText("");
    try {
      await apiPost("/volunteer-requests", {
        volunteer_id: application.id,
        need_id: target.needId,
        task_id: target.taskId,
      });
      await loadAll();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return <div className="text-slate-500">Loading volunteer opportunities...</div>;
  }

  if (!application) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-slate-900">Volunteer Opportunities</h1>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="font-medium text-amber-900">Complete your volunteer profile first.</p>
          <p className="mt-2 text-sm text-amber-700">
            You can request to join causes only after profile registration and admin approval.
          </p>
          <Link
            href="/volunteer/profile"
            className="mt-5 inline-block rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
          >
            Complete Registration
          </Link>
        </div>
      </div>
    );
  }

  if (application.approval_status === "pending") {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-slate-900">Volunteer Opportunities</h1>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="font-medium text-amber-900">Your volunteer profile is pending admin approval.</p>
          <p className="mt-2 text-sm text-amber-700">
            Once approved, you can request participation in needs and open tasks from this page.
          </p>
        </div>
      </div>
    );
  }

  if (application.approval_status === "rejected") {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-slate-900">Volunteer Opportunities</h1>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
          <p className="font-medium text-rose-900">Your volunteer profile was rejected.</p>
          <p className="mt-2 text-sm text-rose-700">Update your profile and resubmit for approval.</p>
          <Link
            href="/volunteer/profile"
            className="mt-5 inline-block rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
          >
            Update Profile
          </Link>
        </div>
      </div>
    );
  }

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "recommended", label: "Recommended", count: recommendedTasks.length },
    { key: "assigned", label: "Assigned", count: assignedTasks.length },
    { key: "tasks", label: "Open Tasks", count: tasks.length },
    { key: "needs", label: "Open Needs", count: needs.length },
    { key: "requests", label: "Requests", count: requests.length },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Volunteer Opportunities</h1>
          <p className="mt-1 text-sm text-slate-600">
            Browse recommended work, open tasks, and open needs from one tabbed view.
          </p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <TabButton
              key={tab.key}
              active={activeTab === tab.key}
              count={tab.count}
              label={tab.label}
              onClick={() => setActiveTab(tab.key)}
            />
          ))}
        </div>
      </header>

      {errorText ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorText}
        </div>
      ) : null}

      {activeTab === "recommended" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Recommended For You</h2>
          {recommendedTasks.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No recommendations right now.
            </div>
          ) : (
            <div className="space-y-3">
              {recommendedTasks.map((recommendation) => {
                const task = recommendation.task;
                const hasPending = requestKeys.has(`task:${task.id}:pending`);
                const hasApproved = requestKeys.has(`task:${task.id}:approved`);
                return (
                  <article key={task.id} className="rounded-2xl border border-sky-200 bg-sky-50/40 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">{task.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">{task.location_text}</p>
                        <p className="mt-1 text-xs text-slate-500">Need: {task.need_title ?? task.report_id}</p>
                      </div>
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                        Match {Math.round(recommendation.totalScore * 100)}%
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                      <span>Skill: {Math.round(recommendation.skillScore * 100)}%</span>
                      <span>Location: {Math.round(recommendation.proximityScore * 100)}%</span>
                      <span>Experience: {Math.round(recommendation.experienceScore * 100)}%</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/volunteer/tasks/${task.id}`}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                      >
                        View Details
                      </Link>
                      {hasApproved ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Approved by admin
                        </span>
                      ) : hasPending ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          Request pending admin approval
                        </span>
                      ) : (
                        <button
                          onClick={() => void requestParticipation({ taskId: task.id })}
                          disabled={busyKey === `task:${task.id}`}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {busyKey === `task:${task.id}` ? "Submitting..." : "Request to Volunteer"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "assigned" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">My Assigned Tasks</h2>
          {assignedTasks.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              You do not have any assigned tasks yet.
            </div>
          ) : (
            <div className="space-y-3">
              {assignedTasks.map((task) => {
                const isDone = task.participant_status === "completed";
                const canComplete = !isDone && ["assigned", "in_progress"].includes(task.status);
                return (
                  <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-slate-900">{task.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">{task.location_text}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isDone ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {isDone ? "Your part completed" : "Assigned to you"}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/volunteer/tasks/${task.id}`}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                      >
                        View Details
                      </Link>
                      {canComplete ? (
                        <button
                          onClick={async () => {
                            setBusyKey(`assigned:${task.id}`);
                            try {
                              await apiPost(`/tasks/${task.id}/complete-by-volunteer`, {
                                volunteer_id: application.id,
                                completion_note: "Completed from volunteer dashboard",
                                actor_label: "Volunteer",
                              });
                              await loadAll();
                            } catch (err) {
                              setErrorText(err instanceof Error ? err.message : "Failed to mark complete");
                            } finally {
                              setBusyKey(null);
                            }
                          }}
                          disabled={busyKey === `assigned:${task.id}`}
                          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {busyKey === `assigned:${task.id}` ? "Updating..." : "Mark My Work Completed"}
                        </button>
                      ) : null}
                    </div>
                    {task.participant_completion_note ? (
                      <p className="mt-2 text-xs text-slate-500">Your note: {task.participant_completion_note}</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "tasks" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Open Tasks</h2>
          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No open tasks available right now.
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => {
                const hasPending = requestKeys.has(`task:${task.id}:pending`);
                const hasApproved = requestKeys.has(`task:${task.id}:approved`);
                return (
                  <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="font-semibold text-slate-900">{task.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{task.location_text}</p>
                    <p className="mt-2 text-xs text-slate-500">Deadline: {new Date(task.deadline).toLocaleString()}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {task.required_skills.map((skill) => (
                        <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                          {skill}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/volunteer/tasks/${task.id}`}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                      >
                        View Details
                      </Link>
                      {hasApproved ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Approved by admin
                        </span>
                      ) : hasPending ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          Request pending admin approval
                        </span>
                      ) : (
                        <button
                          onClick={() => void requestParticipation({ taskId: task.id })}
                          disabled={busyKey === `task:${task.id}`}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {busyKey === `task:${task.id}` ? "Submitting..." : "Request to Volunteer"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "needs" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Open Needs</h2>
          {needs.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No open needs available right now.
            </div>
          ) : (
            <div className="space-y-3">
              {needs.map((need) => {
                const hasPending = requestKeys.has(`need:${need.id}:pending`);
                const hasApproved = requestKeys.has(`need:${need.id}:approved`);
                return (
                  <article key={need.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="font-semibold text-slate-900">{need.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{need.location_text}</p>
                    <p className="mt-2 text-sm text-slate-700">{need.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/volunteer/needs/${need.id}`}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                      >
                        View Need
                      </Link>
                      {hasApproved ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Approved by admin
                        </span>
                      ) : hasPending ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          Request pending admin approval
                        </span>
                      ) : (
                        <button
                          onClick={() => void requestParticipation({ needId: need.id })}
                          disabled={busyKey === `need:${need.id}`}
                          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                        >
                          {busyKey === `need:${need.id}` ? "Submitting..." : "Request to Help This Need"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "requests" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">My Requests</h2>
          {requests.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No participation requests yet.
            </div>
          ) : (
            <div className="space-y-2">
              {requests.slice(0, 8).map((request) => (
                <div key={request.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-700">
                      {request.task_id ? `Task: ${request.task_id}` : `Need: ${request.need_id}`}
                    </p>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(request.status)}`}>
                      {request.status}
                    </span>
                  </div>
                  {request.coordinator_note ? (
                    <p className="mt-2 text-xs text-slate-500">Admin note: {request.coordinator_note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
