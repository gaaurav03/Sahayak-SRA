import {
  availabilityScore,
  isEligible,
  jaccardSimilarity,
  scoreVolunteer,
  workloadScore,
  type Availability,
  type VolunteerForMatch,
  type TaskForMatch,
} from '@sahayak/core';

type VolunteerRow = {
  id: string;
  full_name: string;
  skills: string[] | null;
  location_text: string;
  lat: number | null;
  lng: number | null;
  availability: Record<string, string[]> | null;
  active_tasks: number;
  max_tasks: number;
  is_active: boolean;
  total_deployments: number;
};

type TaskRow = {
  id: string;
  required_skills: string[] | null;
  location_text: string;
  lat: number | null;
  lng: number | null;
  deadline: string;
};

function hasCoordinates(lat: number | null, lng: number | null): lat is number {
  return lat !== null && lng !== null;
}

function normalizeLocation(text: string): string {
  return text.trim().toLowerCase();
}

function canTakeMoreTasks(v: VolunteerRow): boolean {
  return v.is_active && v.active_tasks < v.max_tasks;
}

function toMatchTask(task: TaskRow): TaskForMatch {
  return {
    id: task.id,
    requiredSkills: task.required_skills ?? [],
    location: {
      lat: task.lat ?? 0,
      lng: task.lng ?? 0,
    },
    deadline: new Date(task.deadline),
  };
}

function toMatchVolunteer(v: VolunteerRow): VolunteerForMatch {
  return {
    id: v.id,
    skills: v.skills ?? [],
    location: {
      lat: v.lat ?? 0,
      lng: v.lng ?? 0,
    },
    availability: (v.availability ?? {}) as Availability,
    activeTasks: v.active_tasks,
    maxTasks: v.max_tasks,
    isActive: v.is_active,
  };
}

export function rankMatches(task: TaskRow, volunteers: VolunteerRow[]) {
  const taskInput = toMatchTask(task);

  return volunteers
    .filter((v) => canTakeMoreTasks(v))
    .map((v) => {
      const hasTaskCoords = hasCoordinates(task.lat, task.lng);
      const hasVolunteerCoords = hasCoordinates(v.lat, v.lng);

      const skill = jaccardSimilarity(v.skills ?? [], task.required_skills ?? []);
      const avail = availabilityScore((v.availability ?? {}) as Availability, new Date(task.deadline));
      const load = workloadScore({ activeTasks: v.active_tasks, maxTasks: v.max_tasks });

      let proximity = 0.5;
      let distanceKm = Number.NaN;
      let eligible = true;

      if (hasTaskCoords && hasVolunteerCoords) {
        const volunteerInput = toMatchVolunteer(v);
        const eligibility = isEligible(volunteerInput, taskInput);
        eligible = eligibility.ok;
        distanceKm = eligibility.distanceKm;
        const detailed = scoreVolunteer(volunteerInput, taskInput);
        proximity = detailed.proximityScore;
      } else {
        const sameText = normalizeLocation(v.location_text) === normalizeLocation(task.location_text);
        proximity = sameText ? 0.8 : 0.5;
        eligible = avail > 0;
      }

      const total = skill * 0.45 + proximity * 0.3 + avail * 0.15 + load * 0.1;

      return {
        volunteer: {
          id: v.id,
          full_name: v.full_name,
          skills: v.skills ?? [],
          location_text: v.location_text,
          availability: v.availability ?? {},
          active_tasks: v.active_tasks,
          max_tasks: v.max_tasks,
          total_deployments: v.total_deployments,
        },
        skillScore: Number(skill.toFixed(3)),
        proximityScore: Number(proximity.toFixed(3)),
        availScore: Number(avail.toFixed(3)),
        workloadScore: Number(load.toFixed(3)),
        totalScore: Number(total.toFixed(3)),
        distanceKm: Number.isNaN(distanceKm) ? null : Number(distanceKm.toFixed(3)),
        eligible,
      };
    })
    .filter((item) => item.eligible)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 3);
}
