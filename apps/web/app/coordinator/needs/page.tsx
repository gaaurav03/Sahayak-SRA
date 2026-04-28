"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, type Need } from "../../../lib/api";

type NeedsResponse = { data: Need[] };

function urgencyBadgeClass(score: number) {
  if (score >= 7) return "bg-rose-100 text-rose-700";
  if (score >= 4) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

type Tab = "pending" | "approved";

export default function CoordinatorNeedsPage() {
  const [tab, setTab] = useState<Tab>("approved");
  const [needs, setNeeds] = useState<Need[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [showRejectBox, setShowRejectBox] = useState<string | null>(null);

  const load = useCallback(async (currentTab: Tab) => {
    setLoading(true);
    setErrorText("");
    try {
      const statusQuery = currentTab === "approved" ? "open,task_created,task_completed,resolved" : "pending";
      const res = await apiGet<NeedsResponse>(`/needs?status=${statusQuery}`);
      setNeeds(res.data);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : "Failed to load needs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  async function approve(id: string) {
    setActionBusy(id);
    try {
      await apiPost(`/needs/${id}/approve`, {});
      setNeeds((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function reject(id: string) {
    setActionBusy(id);
    try {
      await apiPost(`/needs/${id}/reject`, { rejection_note: rejectNote[id] ?? "" });
      setNeeds((prev) => prev.filter((n) => n.id !== id));
      setShowRejectBox(null);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold text-slate-900">Needs Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Review reporter submissions and manage open needs.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/submit" className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white">
            Add Need
          </Link>
          <Link href="/coordinator/volunteers" className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700">
            Volunteers
          </Link>
        </div>
      </header>

      <div className="flex gap-2 border-b border-slate-200">
        {(["approved", "pending"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-5 py-2.5 text-sm font-semibold capitalize transition-colors ${tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
          >
            {t === "pending" ? "Pending Review" : "Approved Needs"}
          </button>
        ))}
      </div>

      {errorText ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorText}</div>
      ) : null}

      {loading ? (
        <div className="py-16 text-center text-slate-400">Loading...</div>
      ) : needs.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white/70 p-10 text-center text-slate-500">
          {tab === "pending" ? "No pending submissions to review." : "No approved needs yet."}
        </div>
      ) : (
        <section className="space-y-4">
          {needs.map((need) => (
            <article key={need.id} className="glass rounded-3xl p-6 soft-ring">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{need.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{need.location_text}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-700">{need.category}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${urgencyBadgeClass(need.urgency_score)}`}>
                    Urgency {need.urgency_score}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-sm text-slate-700">{need.description || "No description provided."}</p>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <p className="text-xs uppercase text-slate-500">Severity</p>
                  <p className="text-sm font-semibold capitalize text-slate-900">{need.severity_self}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <p className="text-xs uppercase text-slate-500">Affected</p>
                  <p className="text-sm font-semibold text-slate-900">{need.affected_count}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <p className="text-xs uppercase text-slate-500">Submitted</p>
                  <p className="text-sm font-semibold text-slate-900">{new Date(need.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                {tab === "pending" ? (
                  <div className="flex w-full flex-col gap-2">
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => approve(need.id)}
                        disabled={actionBusy === need.id}
                        className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {actionBusy === need.id ? "Processing..." : "Approve"}
                      </button>
                      <button
                        onClick={() => setShowRejectBox(showRejectBox === need.id ? null : need.id)}
                        disabled={actionBusy === need.id}
                        className="rounded-full border border-rose-300 px-5 py-2 text-sm font-semibold text-rose-600 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>

                    {showRejectBox === need.id ? (
                      <div className="mt-1 flex gap-2">
                        <input
                          type="text"
                          placeholder="Reason for rejection (optional)"
                          value={rejectNote[need.id] ?? ""}
                          onChange={(e) => setRejectNote((prev) => ({ ...prev, [need.id]: e.target.value }))}
                          className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        />
                        <button
                          onClick={() => reject(need.id)}
                          disabled={actionBusy === need.id}
                          className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          Confirm
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-500">
                      Status: <span className="font-medium capitalize">{need.status.replace("_", " ")}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/coordinator/needs/${need.id}`}
                        className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                      >
                        View Details
                      </Link>
                      {need.status === "task_created" ? (
                        <span className="rounded-full bg-purple-100 px-4 py-1.5 text-xs font-semibold text-purple-700">Task in progress</span>
                      ) : need.status === "task_completed" ? (
                        <span className="rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold text-blue-700">✓ Task done — awaiting verification</span>
                      ) : need.status === "resolved" ? (
                        <span className="rounded-full bg-emerald-100 px-4 py-1.5 text-xs font-semibold text-emerald-700">✓ Resolved</span>
                      ) : need.status === "open" ? (
                        <Link href={`/coordinator/tasks/new?report_id=${need.id}`} className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors">
                          Create Task
                        </Link>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

