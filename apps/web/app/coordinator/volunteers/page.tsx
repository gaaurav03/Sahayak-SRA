"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, type Need, type Task, type Volunteer, type VolunteerRequest } from "../../../lib/api";

type VolunteersResponse = { data: Volunteer[] };
type VolunteerRequestsResponse = { data: VolunteerRequest[] };
type TasksResponse = { data: Task[] };
type NeedsResponse = { data: Need[] };

export default function VolunteersPage() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busyVolunteerId, setBusyVolunteerId] = useState<string | null>(null);
  const [requests, setRequests] = useState<VolunteerRequest[]>([]);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [volunteerRes, requestRes, taskRes, needRes] = await Promise.all([
        apiGet<VolunteersResponse>("/volunteers"),
        apiGet<VolunteerRequestsResponse>("/volunteer-requests?status=pending"),
        apiGet<TasksResponse>("/tasks"),
        apiGet<NeedsResponse>("/needs?status=pending,open,task_created,resolved,rejected"),
      ]);
      setVolunteers(volunteerRes.data);
      setRequests(requestRes.data);
      setTasks(taskRes.data);
      setNeeds(needRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load volunteers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approveVolunteer(volunteerId: string) {
    setBusyVolunteerId(volunteerId);
    setError("");
    try {
      await apiPost(`/volunteers/${volunteerId}/approve`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve volunteer");
    } finally {
      setBusyVolunteerId(null);
    }
  }

  async function rejectVolunteer(volunteerId: string) {
    const reason = window.prompt("Reason for rejection (optional):", "") ?? "";
    setBusyVolunteerId(volunteerId);
    setError("");
    try {
      await apiPost(`/volunteers/${volunteerId}/reject`, { rejection_note: reason });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject volunteer");
    } finally {
      setBusyVolunteerId(null);
    }
  }

  async function approveRequest(requestId: string) {
    setBusyRequestId(requestId);
    setError("");
    try {
      await apiPost(`/volunteer-requests/${requestId}/approve`, {});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve request");
    } finally {
      setBusyRequestId(null);
    }
  }

  async function rejectRequest(requestId: string) {
    const note = window.prompt("Reason for rejection (optional):", "") ?? "";
    setBusyRequestId(requestId);
    setError("");
    try {
      await apiPost(`/volunteer-requests/${requestId}/reject`, { coordinator_note: note });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject request");
    } finally {
      setBusyRequestId(null);
    }
  }

  const filtered = volunteers.filter((v) => {
    const q = search.toLowerCase();
    return (
      v.full_name.toLowerCase().includes(q) ||
      (v.email ?? "").toLowerCase().includes(q) ||
      v.location_text.toLowerCase().includes(q) ||
      v.skills.some((s) => s.toLowerCase().includes(q))
    );
  });

  const pending = filtered.filter((v) => v.approval_status === "pending");
  const approved = filtered.filter((v) => v.approval_status === "approved");
  const rejected = filtered.filter((v) => v.approval_status === "rejected");
  const activeApproved = approved.filter((v) => v.is_active);
  const inactiveApproved = approved.filter((v) => !v.is_active);
  const volunteerNameById = new Map(volunteers.map((v) => [v.id, v.full_name]));
  const taskTitleById = new Map(tasks.map((t) => [t.id, t.title]));
  const needTitleById = new Map(needs.map((n) => [n.id, n.title]));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-slate-900">Volunteers</h1>
          <p className="mt-1 text-sm text-slate-500">
            {volunteers.length} registered · {pending.length} pending · {approved.length} approved
          </p>
        </div>
        <Link
          href="/coordinator/needs"
          className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700"
        >
          Back to Dashboard
        </Link>
      </header>

      <input
        type="text"
        placeholder="Search by name, skill, or location..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="py-16 text-center text-slate-400">Loading volunteers...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white/70 p-10 text-center text-slate-500">
          {search ? `No volunteers matching "${search}".` : "No volunteers registered yet."}
        </div>
      ) : (
        <>
          {requests.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-sky-600">
                Pending Participation Requests ({requests.length})
              </h2>
              {requests.map((req) => (
                <article key={req.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-slate-700">
                    Volunteer:{" "}
                    <span className="font-semibold">
                      {volunteerNameById.get(req.volunteer_id) ?? req.volunteer_id}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Target:{" "}
                    {req.task_id
                      ? `Task: ${taskTitleById.get(req.task_id) ?? req.task_id}`
                      : `Need: ${needTitleById.get(req.need_id ?? "") ?? req.need_id}`}
                  </p>
                  {req.note ? <p className="mt-1 text-xs text-slate-500">Note: {req.note}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => void approveRequest(req.id)}
                      disabled={busyRequestId === req.id}
                      className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {busyRequestId === req.id ? "Processing..." : "Approve Request"}
                    </button>
                    <button
                      onClick={() => void rejectRequest(req.id)}
                      disabled={busyRequestId === req.id}
                      className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
                    >
                      Reject Request
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          {pending.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-amber-600">
                Pending Approval ({pending.length})
              </h2>
              {pending.map((v) => (
                <VolunteerCard
                  key={v.id}
                  volunteer={v}
                  busy={busyVolunteerId === v.id}
                  onApprove={() => void approveVolunteer(v.id)}
                  onReject={() => void rejectVolunteer(v.id)}
                />
              ))}
            </section>
          ) : null}

          {activeApproved.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-600">
                Approved Active ({activeApproved.length})
              </h2>
              {activeApproved.map((v) => (
                <VolunteerCard key={v.id} volunteer={v} />
              ))}
            </section>
          ) : null}

          {inactiveApproved.length > 0 ? (
            <section className="mt-6 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Approved Inactive ({inactiveApproved.length})
              </h2>
              {inactiveApproved.map((v) => (
                <VolunteerCard key={v.id} volunteer={v} muted />
              ))}
            </section>
          ) : null}

          {rejected.length > 0 ? (
            <section className="mt-6 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-rose-600">
                Rejected ({rejected.length})
              </h2>
              {rejected.map((v) => (
                <VolunteerCard key={v.id} volunteer={v} muted />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function VolunteerCard({
  volunteer: v,
  muted,
  busy,
  onApprove,
  onReject,
}: {
  volunteer: Volunteer;
  muted?: boolean;
  busy?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const utilisation = v.max_tasks > 0 ? Math.round((v.active_tasks / v.max_tasks) * 100) : 0;
  const isPending = v.approval_status === "pending";
  const isRejected = v.approval_status === "rejected";

  return (
    <article
      className={`rounded-2xl border p-5 transition-shadow ${
        muted
          ? "border-slate-200 bg-white/50 opacity-70"
          : "border-slate-200 bg-white shadow-sm hover:shadow-md"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/coordinator/volunteers/${v.id}`} className="text-lg font-semibold text-slate-900 underline-offset-2 hover:underline">
            {v.full_name}
          </Link>
          <p className="text-sm text-slate-500">
            {v.email ?? "No email"} · {v.phone}
          </p>
          <p className="text-sm text-slate-500">{v.location_text}</p>
        </div>

        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            isPending
              ? "bg-amber-100 text-amber-700"
              : isRejected
              ? "bg-rose-100 text-rose-700"
              : v.is_active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {isPending ? "Pending" : isRejected ? "Rejected" : v.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      {v.skills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {v.skills.map((s) => (
            <span key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
              {s}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 space-y-1">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Task capacity</span>
          <span>
            {v.active_tasks}/{v.max_tasks} active · {v.total_deployments} total deployments
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100">
          <div
            className={`h-2 rounded-full transition-all ${
              utilisation >= 100 ? "bg-rose-500" : utilisation >= 70 ? "bg-amber-400" : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(utilisation, 100)}%` }}
          />
        </div>
      </div>

      {isPending ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={onApprove}
            disabled={busy}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Processing..." : "Approve"}
          </button>
          <button
            onClick={onReject}
            disabled={busy}
            className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      ) : null}

      {isRejected && v.rejection_note ? (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Rejection note: {v.rejection_note}
        </p>
      ) : null}
      <div className="mt-3">
        <Link href={`/coordinator/volunteers/${v.id}`} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
          View Full Profile
        </Link>
      </div>
    </article>
  );
}

