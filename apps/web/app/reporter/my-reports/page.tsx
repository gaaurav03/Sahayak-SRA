"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { apiGet, type Need } from "../../../lib/api";

type NeedsResponse = { data: Need[] };

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:      { label: "Awaiting Review",  color: "bg-amber-100 text-amber-800 border-amber-200",   icon: "⏳" },
  open:         { label: "Approved",         color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: "✅" },
  rejected:     { label: "Rejected",         color: "bg-rose-100 text-rose-800 border-rose-200",        icon: "❌" },
  task_created: { label: "Task Created",     color: "bg-purple-100 text-purple-800 border-purple-200",  icon: "🔧" },
  resolved:     { label: "Resolved",         color: "bg-slate-100 text-slate-700 border-slate-200",     icon: "🎉" },
};

export default function MyReportsPage() {
  const { userId, isLoaded } = useAuth();
  const [reports, setReports] = useState<Need[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoaded || !userId) return;

    async function fetchMyReports() {
      try {
        const res = await apiGet<NeedsResponse>(`/needs?reporter_clerk_id=${userId}`);
        setReports(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reports");
      } finally {
        setLoading(false);
      }
    }

    void fetchMyReports();
  }, [isLoaded, userId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">My Submissions</h1>
          <p className="text-slate-500 text-sm mt-1">Track the status of every report you&apos;ve submitted.</p>
        </div>
        <Link
          href="/submit"
          className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          + Submit New Need
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading your submissions...</div>
      ) : reports.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white/70 p-12 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-slate-600 font-medium">No submissions yet.</p>
          <p className="text-slate-400 text-sm mt-1 mb-6">Submit your first community need report below.</p>
          <Link
            href="/submit"
            className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Submit a Need
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const cfg = STATUS_CONFIG[report.status] ?? { label: report.status, color: "bg-slate-100 text-slate-600 border-slate-200", icon: "•" };
            return (
              <article key={report.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link href={`/reporter/my-reports/${report.id}`} className="text-lg font-semibold text-slate-900 underline-offset-2 hover:underline">
                      {report.title}
                    </Link>
                    <p className="text-sm text-slate-500 mt-0.5">{report.location_text}</p>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                </div>

                {report.description ? (
                  <p className="mt-3 text-sm text-slate-600 line-clamp-2">{report.description}</p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 capitalize">{report.category}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 capitalize">Severity: {report.severity_self}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{report.affected_count} affected</span>
                  <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs text-indigo-700">Confidence: {report.urgency_confidence ?? 0}%</span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-700">
                    Proof: {report.image_urls?.length ? `${report.image_urls.length} image${report.image_urls.length > 1 ? "s" : ""}` : "missing"}
                  </span>
                </div>
                {(report.urgency_reasons ?? []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(report.urgency_reasons ?? []).slice(0, 4).map((reason) => (
                      <span key={`${reason.label}-${reason.points}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        {reason.label} ({reason.points >= 0 ? "+" : ""}{reason.points})
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Show rejection note if rejected */}
                {report.status === "rejected" && (report as Need & { rejection_note?: string }).rejection_note ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    <span className="font-semibold">Coordinator note: </span>
                    {(report as Need & { rejection_note?: string }).rejection_note}
                  </div>
                ) : null}

                <p className="mt-3 text-xs text-slate-400">
                  Submitted {new Date(report.created_at).toLocaleString()}
                </p>
                {report.client_captured_at ? (
                  <p className="mt-1 text-xs text-slate-400">
                    Captured {new Date(report.client_captured_at).toLocaleString()}
                  </p>
                ) : null}

                {(report.status === "open" || report.status === "task_created") ? (
                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/reporter/my-reports/${report.id}`}
                      className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                    >
                      View Details
                    </Link>
                    <Link
                      href={`/reporter/tasks/new?report_id=${report.id}`}
                      className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                    >
                      Create Task For This Need
                    </Link>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
