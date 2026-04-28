"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, type Volunteer } from "../../../lib/api";

type VolunteersResponse = { data: Volunteer[] };

function statusClasses(status: Volunteer["approval_status"]) {
  if (status === "approved") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "rejected") return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

export default function VolunteerProfilePage() {
  const { userId, isLoaded } = useAuth();
  const { user } = useUser();
  const [application, setApplication] = useState<Volunteer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? "";
  const defaultName =
    user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "";

  async function loadApplication() {
    if (!userId) return;
    setLoading(true);
    try {
      const response = await apiGet<VolunteersResponse>(`/volunteers?clerk_id=${userId}`);
      setApplication(response.data[0] ?? null);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load volunteer profile");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded || !userId) return;
    void loadApplication();
  }, [isLoaded, userId]);

  const canSubmit = useMemo(
    () => !application || application.approval_status === "rejected",
    [application]
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const form = new FormData(event.currentTarget);

    try {
      const response = await apiPost<{ data: Volunteer }>("/volunteers", {
        clerk_id: userId,
        full_name: String(form.get("full_name") || ""),
        phone: String(form.get("phone") || ""),
        email: email || null,
        skills: String(form.get("skills") || "")
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
        location_text: String(form.get("location_text") || ""),
        availability: { Mon: ["09:00-17:00"] },
        max_tasks: Number(form.get("max_tasks") || 2),
      });
      setApplication(response.data);
      setSuccess("Volunteer registration submitted. It is now pending coordinator approval.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit registration");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-slate-500">Loading volunteer profile...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-slate-900">Profile & Skills</h1>
        <p className="mt-1 text-sm text-slate-500">
          Submit your volunteer profile for coordinator approval before you can be assigned.
        </p>
      </div>

      {application ? (
        <section className="glass rounded-3xl p-6 soft-ring">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{application.full_name}</h2>
              <p className="mt-1 text-sm text-slate-600">{application.email || "No email"} · {application.phone}</p>
              <p className="mt-1 text-sm text-slate-600">{application.location_text}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusClasses(application.approval_status)}`}>
              {application.approval_status}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
              <p className="text-xs uppercase text-slate-500">Skills</p>
              <p className="text-sm font-semibold text-slate-900">
                {(application.skills || []).join(", ") || "None listed"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
              <p className="text-xs uppercase text-slate-500">Capacity</p>
              <p className="text-sm font-semibold text-slate-900">
                {application.active_tasks}/{application.max_tasks} active tasks
              </p>
            </div>
          </div>

          {application.approval_status === "pending" ? (
            <p className="mt-4 text-sm text-amber-700">
              Your registration is waiting for coordinator review.
            </p>
          ) : null}

          {application.approval_status === "approved" ? (
            <p className="mt-4 text-sm text-emerald-700">
              Your profile is approved. You can now receive task assignments.
            </p>
          ) : null}

          {application.approval_status === "rejected" ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <p className="font-semibold">Coordinator feedback</p>
              <p className="mt-1">{application.rejection_note || "No note provided."}</p>
              <p className="mt-2 text-rose-600">
                Update your details below and resubmit when ready.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {canSubmit ? (
        <form onSubmit={onSubmit} className="glass space-y-4 rounded-3xl p-6 soft-ring">
          <input
            name="full_name"
            defaultValue={application?.full_name || defaultName}
            placeholder="Full name"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          />
          <input
            name="phone"
            defaultValue={application?.phone || ""}
            placeholder="Phone"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          />
          <input
            value={email}
            readOnly
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500"
          />
          <input
            name="skills"
            defaultValue={(application?.skills || []).join(", ")}
            placeholder="Skills comma separated (medical, driving, logistics)"
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          />
          <input
            name="location_text"
            defaultValue={application?.location_text || ""}
            placeholder="Location"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          />
          <input
            name="max_tasks"
            type="number"
            min={1}
            max={10}
            defaultValue={application?.max_tasks || 2}
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Submitting..." : application ? "Resubmit Application" : "Submit Registration"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
