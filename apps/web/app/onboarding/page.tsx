"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isCoordinatorAdminEmail } from "../../lib/admin";

type UserRole = "coordinator" | "volunteer" | "reporter";

export default function OnboardingPage() {
  const { getToken } = useAuth();
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
  const isCoordinatorAdmin = isCoordinatorAdminEmail(email);

  useEffect(() => {
    if (isLoaded && user?.publicMetadata?.role) {
      const role = user.publicMetadata.role as string;
      if (role === "coordinator" && isCoordinatorAdmin) router.push("/coordinator/needs");
      else if (role === "volunteer") router.push("/volunteer/tasks");
      else if (role === "reporter") router.push("/reporter/my-reports");
    }
  }, [isCoordinatorAdmin, isLoaded, user, router]);

  const selectRole = async (role: UserRole) => {
    if (role === "coordinator" && !isCoordinatorAdmin) {
      setSelectionError("Only the configured admin account can use the coordinator role.");
      return;
    }

    setIsSubmitting(true);
    setSelectionError("");
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("No active Clerk session token found");
      }

      const res = await fetch("/api/v1/auth/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      });
      
      if (res.ok) {
        // Force a reload of the session token so the new metadata is available
        await user?.reload();
        if (role === "coordinator") router.push("/coordinator/needs");
        else if (role === "volunteer") router.push("/volunteer/tasks");
        else if (role === "reporter") router.push("/reporter/my-reports");
      } else {
        const errorData = await res.json().catch(() => null);
        const message =
          typeof errorData?.error === "string"
            ? errorData.error
            : typeof errorData?.message === "string"
              ? errorData.message
              : res.statusText || `Request failed with status ${res.status}`;
        setSelectionError(message);
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error(error);
      setSelectionError(error instanceof Error ? error.message : "Failed to set role");
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || isSubmitting) {
    return <div className="flex h-[50vh] items-center justify-center">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto mt-12 p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
      <h1 className="text-3xl font-display font-bold text-slate-800 mb-2">Welcome to Sahayak</h1>
      <p className="text-slate-600 mb-8">How would you like to use the platform?</p>
      {!isCoordinatorAdmin ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Coordinator access is reserved for the single admin account: `gaurav21687@gmail.com`.
        </div>
      ) : null}
      {selectionError ? (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {selectionError}
        </div>
      ) : null}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Coordinator */}
        <div 
          onClick={() => selectRole("coordinator")}
          className={`p-6 border border-gray-200 rounded-xl transition-all group ${
            isCoordinatorAdmin
              ? "cursor-pointer hover:border-purple-500 hover:shadow-md"
              : "cursor-not-allowed opacity-55 bg-slate-50"
          }`}
        >
          <div className="h-12 w-12 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <h3 className="font-bold text-slate-800 mb-2">NGO Coordinator</h3>
          <p className="text-sm text-slate-500">I want to manage volunteers, review needs, and assign tasks.</p>
        </div>

        {/* Volunteer */}
        <div 
          onClick={() => selectRole("volunteer")}
          className="p-6 border border-gray-200 rounded-xl cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all group"
        >
          <div className="h-12 w-12 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z"></path></svg>
          </div>
          <h3 className="font-bold text-slate-800 mb-2">Volunteer</h3>
          <p className="text-sm text-slate-500">I want to offer my skills and time to help complete tasks.</p>
        </div>

        {/* Reporter */}
        <div 
          onClick={() => selectRole("reporter")}
          className="p-6 border border-gray-200 rounded-xl cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group"
        >
          <div className="h-12 w-12 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </div>
          <h3 className="font-bold text-slate-800 mb-2">Field Reporter</h3>
          <p className="text-sm text-slate-500">I want to report community needs and problems I find.</p>
        </div>
      </div>
    </div>
  );
}
