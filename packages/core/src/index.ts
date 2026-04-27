export type LatLng = { lat: number; lng: number };

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * (sinDLng * sinDLng);

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function jaccardSimilarity(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a.map((s) => s.trim()).filter(Boolean));
  const setB = new Set(b.map((s) => s.trim()).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export type WorkloadScoreInput = {
  activeTasks: number;
  maxTasks: number;
};

export function workloadScore({ activeTasks, maxTasks }: WorkloadScoreInput): number {
  if (activeTasks <= 0) return 1.0;
  if (activeTasks === 1) return 0.7;
  if (activeTasks >= maxTasks) return 0.0;
  if (activeTasks === maxTasks - 1) return 0.3;
  return 0.5;
}

export type Availability = Record<string, string[]>; // { "Mon": ["09:00-12:00"], "Sat": ["all-day"] }

export type VolunteerForMatch = {
  id: string;
  skills: string[];
  location: LatLng;
  availability?: Availability;
  activeTasks: number;
  maxTasks: number;
  isActive: boolean;
};

export type TaskForMatch = {
  id: string;
  requiredSkills: string[];
  location: LatLng;
  deadline: Date;
};

export type MatchScoreBreakdown = {
  skillScore: number;
  proximityScore: number;
  availScore: number;
  workloadScore: number;
  totalScore: number;
  distanceKm: number;
};

const WEEKDAYS: Array<[number, string]> = [
  [0, 'Sun'],
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
];

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function slotMatchesDeadline(slot: string, deadline: Date): boolean {
  const normalized = slot.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'all-day' || normalized === 'allday') return true;

  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!match) return false;

  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  const t = minutesSinceMidnight(deadline);
  return t >= start && t <= end;
}

export function availabilityScore(availability: Availability | undefined, deadline: Date): number {
  if (!availability) return 0.5;

  const dayKey = WEEKDAYS.find(([idx]) => idx === deadline.getDay())?.[1];
  if (!dayKey) return 0.5;

  const slots = availability[dayKey];
  if (!slots) return 0.0;
  if (slots.length === 0) return 0.0;

  return slots.some((slot) => slotMatchesDeadline(slot, deadline)) ? 1.0 : 0.0;
}

export function isEligible(volunteer: VolunteerForMatch, task: TaskForMatch): { ok: boolean; distanceKm: number } {
  if (!volunteer.isActive) return { ok: false, distanceKm: Infinity };
  if (volunteer.activeTasks >= volunteer.maxTasks) return { ok: false, distanceKm: Infinity };

  const distanceKm = haversineKm(volunteer.location, task.location);
  if (distanceKm > 50) return { ok: false, distanceKm };

  // If availability is not provided, assume eligible (avail_score becomes 0.5)
  if (!volunteer.availability) return { ok: true, distanceKm };

  // If availability is provided, require overlap
  const aScore = availabilityScore(volunteer.availability, task.deadline);
  return { ok: aScore > 0, distanceKm };
}

export function scoreVolunteer(volunteer: VolunteerForMatch, task: TaskForMatch): MatchScoreBreakdown {
  const { distanceKm } = isEligible(volunteer, task);
  const skillScore = jaccardSimilarity(volunteer.skills, task.requiredSkills);
  const proximityScore = Math.max(0, 1 - distanceKm / 50);
  const availScore = availabilityScore(volunteer.availability, task.deadline);
  const wScore = workloadScore({ activeTasks: volunteer.activeTasks, maxTasks: volunteer.maxTasks });

  const totalScore = skillScore * 0.45 + proximityScore * 0.3 + availScore * 0.15 + wScore * 0.1;

  return {
    skillScore,
    proximityScore,
    availScore,
    workloadScore: wScore,
    totalScore,
    distanceKm,
  };
}
