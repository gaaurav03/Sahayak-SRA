"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiPost, type UserProfile } from "../../../lib/api";

type UsersResponse = { data: UserProfile[] };

export default function CoordinatorProfilePage() {
  const { userId } = useAuth();
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    async function load() {
      if (!isLoaded || !userId) return;
      setLoading(true);
      setError("");
      try {
        const res = await apiGet<UsersResponse>(`/users?clerk_id=${userId}`);
        const existing = res.data[0];
        if (existing) {
          setFullName(existing.full_name ?? "");
          setEmail(existing.email ?? "");
          setPhone(existing.phone ?? "");
        } else {
          setFullName(user?.fullName ?? "");
          setEmail(user?.primaryEmailAddress?.emailAddress ?? "");
          setPhone("");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [isLoaded, userId, user]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiPost("/users/profile", {
        clerk_id: userId,
        role: "coordinator",
        full_name: fullName,
        email: email || null,
        phone: phone || null,
      });
      setSuccess("Profile updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-slate-500">Loading profile...</div>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-slate-900">My Profile</h1>
        <p className="mt-1 text-sm text-slate-500">View and edit your coordinator profile details.</p>
      </header>

      <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <label className="block text-sm font-semibold text-slate-700">
          Full Name
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Phone
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </form>
    </div>
  );
}
