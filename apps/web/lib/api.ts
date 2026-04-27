export type Need = {
  id: string;
  title: string;
  description: string;
  category: string;
  severity_self: string;
  affected_count: number;
  location_text: string;
  urgency_score: number;
  status: string;
  created_at: string;
};

export type Volunteer = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  skills: string[];
  location_text: string;
  availability: Record<string, string[]>;
  max_tasks: number;
  active_tasks: number;
  is_active: boolean;
  total_deployments: number;
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
  assigned_to: string | null;
  completion_note: string | null;
  created_at: string;
  completed_at: string | null;
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

function baseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiGet<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
