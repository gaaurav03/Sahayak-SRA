export type Need = {
  id: string;
  title: string;
  description: string;
  category: string;
  severity_self: string;
  affected_count: number;
  location_text: string;
  lat: number | null;
  lng: number | null;
  image_urls?: string[];
  client_captured_at?: string | null;
  urgency_score: number;
  urgency_confidence?: number | null;
  urgency_reasons?: Array<{ label: string; points: number }>;
  urgency_override_score?: number | null;
  urgency_override_note?: string | null;
  urgency_override_by?: string | null;
  urgency_override_at?: string | null;
  dynamic_components?: { hoursSinceCreated: number; clusterCount: number };
  status: string;
  reporter_clerk_id: string | null;
  rejection_note: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  created_at: string;
};

export type Volunteer = {
  id: string;
  clerk_id: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  skills: string[];
  location_text: string;
  availability: Record<string, string[]>;
  max_tasks: number;
  active_tasks: number;
  approval_status: "pending" | "approved" | "rejected";
  rejection_note: string | null;
  is_active: boolean;
  total_deployments: number;
  created_at: string;
};

export type UserProfile = {
  id: string;
  clerk_id: string;
  org_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: "coordinator" | "volunteer" | "reporter";
  created_at: string;
};

export type Task = {
  id: string;
  report_id: string;
  title: string;
  description: string;
  required_skills: string[];
  estimated_hours: number | null;
  deadline: string;
  location_text: string;
  status: string;
  approval_status?: "pending" | "approved" | "rejected";
  rejection_note?: string | null;
  reporter_clerk_id?: string | null;
  assigned_to: string | null;
  completion_note: string | null;
  created_at: string;
  completed_at: string | null;
  participant_status?: "assigned" | "completed";
  participant_completion_note?: string | null;
  participant_completed_at?: string | null;
};

export type MatchResult = {
  volunteer: {
    id: string;
    full_name: string;
    skills: string[];
    location_text: string;
    availability: Record<string, string[]>;
    active_tasks: number;
    max_tasks: number;
    total_deployments: number;
  };
  skillScore: number;
  proximityScore: number;
  availScore: number;
  workloadScore: number;
  totalScore: number;
  distanceKm: number | null;
};

export type AnalyticsOverview = {
  summary: {
    openNeeds: number;
    unresolvedCriticalNeeds: number;
    activeTasks: number;
    overdueTasks: number;
    verifiedCompletionRate: number;
    averageOpenUrgency: number;
    volunteerUtilizationRate: number;
    availableVolunteers: number;
  };
  taskStatus: Array<{
    label: string;
    value: number;
  }>;
  needStatus: Array<{
    label: string;
    value: number;
  }>;
  needsByCategory: Array<{
    label: string;
    value: number;
  }>;
  urgencyBands: Array<{
    label: string;
    value: number;
  }>;
  dailyFlow: Array<{
    day: string;
    needsCreated: number;
    tasksCreated: number;
    tasksCompleted: number;
    tasksVerified: number;
  }>;
  volunteerCapacity: {
    activeVolunteers: number;
    inactiveVolunteers: number;
    totalSlots: number;
    usedSlots: number;
  };
  skillBalance: Array<{
    skill: string;
    supply: number;
    demand: number;
    gap: number;
  }>;
  topVolunteers: Array<{
    id: string;
    full_name: string;
    total_deployments: number;
    active_tasks: number;
    max_tasks: number;
    is_active: boolean;
  }>;
  recentTaskEvents: Array<{
    id: string;
    actor_label: string;
    to_status: string;
    created_at: string;
    note: string | null;
  }>;
};

export type VolunteerRequest = {
  id: string;
  volunteer_id: string;
  need_id: string | null;
  task_id: string | null;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  coordinator_note: string | null;
  decided_at: string | null;
  created_at: string;
};

export type TaskRecommendation = {
  task: Task & { need_title?: string | null };
  skillScore: number;
  proximityScore: number;
  availScore: number;
  workloadScore: number;
  experienceScore: number;
  totalScore: number;
  distanceKm: number | null;
};

export type NeedTimelineEntry = {
  type: "created" | "approved" | "task_created" | "assigned" | "completed" | "verified";
  title: string;
  timestamp: string | null;
  actor_label: string | null;
  note: string | null;
  task_id: string | null;
  task_title: string | null;
};

function baseUrl() {
  if (typeof window !== "undefined") {
    return "/api/v1";
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api/v1";
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    let message = "";

    if (contentType.includes("application/json")) {
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; message?: string; details?: unknown }
        | null;
      message =
        payload?.error ||
        payload?.message ||
        (typeof payload?.details === "string" ? payload.details : "");
    } else {
      message = await res.text();
    }

    throw new Error(message || `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiGet<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
