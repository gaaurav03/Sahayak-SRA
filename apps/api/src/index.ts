import cors from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { z, ZodError } from 'zod';
import { verifyToken } from '@clerk/backend';
import { clerkMiddleware } from '@clerk/express';
import { rankMatches, rankTasksForVolunteer } from './lib/matching.js';
import {
  assignTaskSchema,
  completeTaskSchema,
  completeTaskByVolunteerSchema,
  createNeedSchema,
  createTaskSchema,
  createVolunteerRequestSchema,
  createVolunteerSchema,
  rejectVolunteerRequestSchema,
  rejectTaskSchema,
  rejectVolunteerSchema,
  needTimelineEntrySchema,
  needPriorityOverrideSchema,
  verifyTaskSchema,
} from './lib/schemas.js';
import { supabase } from './lib/supabase.js';
import { computeUrgencyEvaluation, computeUrgencyScore } from './lib/urgency.js';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(clerkMiddleware());

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: error.flatten() });
  }

  if (typeof error === 'object' && error !== null) {
    const maybeDbError = error as { code?: string; message?: string };
    if (maybeDbError.code === '23505') {
      return res.status(409).json({ error: maybeDbError.message ?? 'Duplicate record' });
    }
    if (typeof maybeDbError.message === 'string' && maybeDbError.message.trim().length > 0) {
      return res.status(500).json({ error: maybeDbError.message });
    }
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error';
  return res.status(500).json({ error: message });
}

async function addTaskEvent(params: {
  task_id: string;
  actor_label: string;
  from_status: string | null;
  to_status: string;
  note: string;
}) {
  const { error } = await supabase.from('task_events').insert(params);
  if (error) throw new Error(error.message);
}

type AssignmentStatus = 'assigned' | 'completed';

async function getTaskAssignments(taskId: string) {
  return await supabase
    .from('task_assignments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
}

async function assignVolunteerToTask(params: {
  task: {
    id: string;
    status: string;
    assigned_to: string | null;
  };
  volunteer: {
    id: string;
    active_tasks: number;
    max_tasks: number;
    approval_status: string;
    is_active: boolean;
  };
  actorLabel: string;
  note: string;
}) {
  const { task, volunteer, actorLabel, note } = params;
  if (volunteer.approval_status !== 'approved' || !volunteer.is_active || volunteer.active_tasks >= volunteer.max_tasks) {
    throw new Error('Volunteer is not eligible for assignment');
  }
  if (!['open', 'assigned', 'in_progress'].includes(task.status)) {
    throw new Error(`Task cannot accept assignments in status ${task.status}`);
  }

  const existingAssignmentResult = await supabase
    .from('task_assignments')
    .select('id')
    .eq('task_id', task.id)
    .eq('volunteer_id', volunteer.id)
    .maybeSingle();
  if (existingAssignmentResult.error) throw new Error(existingAssignmentResult.error.message);
  if (existingAssignmentResult.data) {
    throw new Error('Volunteer is already assigned to this task');
  }

  const { error: assignmentError } = await supabase.from('task_assignments').insert({
    task_id: task.id,
    volunteer_id: volunteer.id,
    status: 'assigned' satisfies AssignmentStatus,
  });
  if (assignmentError) throw new Error(assignmentError.message);

  const { error: taskUpdateError } = await supabase
    .from('tasks')
    .update({
      status: task.status === 'open' ? 'assigned' : task.status,
      assigned_to: task.assigned_to ?? volunteer.id,
    })
    .eq('id', task.id);
  if (taskUpdateError) throw new Error(taskUpdateError.message);

  const { error: volunteerUpdateError } = await supabase
    .from('volunteers')
    .update({ active_tasks: volunteer.active_tasks + 1 })
    .eq('id', volunteer.id);
  if (volunteerUpdateError) throw new Error(volunteerUpdateError.message);

  await addTaskEvent({
    task_id: task.id,
    actor_label: actorLabel,
    from_status: task.status,
    to_status: task.status === 'open' ? 'assigned' : task.status,
    note,
  });
}

function dayKey(dateValue: string) {
  return new Date(dateValue).toISOString().slice(0, 10);
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function isMissingColumnError(error: unknown, table: string, column: string) {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { code?: string; message?: string };
  if (maybeError.code === '42703') return true;
  const message = (maybeError.message ?? '').toLowerCase();
  return message.includes(`column ${table}.${column} does not exist`);
}

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'api', time: new Date().toISOString() });
});

import { clerkClient } from '@clerk/express';
import { AuthenticatedRequest } from './lib/auth.js';

const router = express.Router();

const userRoleEnum = z.enum(['coordinator', 'volunteer', 'reporter']);
const upsertUserProfileSchema = z.object({
  clerk_id: z.string().min(1),
  role: userRoleEnum.default('coordinator'),
  full_name: z.string().min(2).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(6).max(30).optional().nullable(),
});

router.post('/auth/sync', async (req: AuthenticatedRequest, res) => {
  try {
    // Manually extract and verify the Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = authHeader.slice(7);

    // Verify the token with Clerk
    let payload: { sub?: string };
    try {
      payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
    } catch (e) {
      console.error('[auth/sync] Token verification failed:', e);
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }

    const userId = payload.sub;
    if (!userId) return res.status(401).json({ error: 'Cannot determine user from token' });

    const role = req.body.role;
    if (!role || !['coordinator', 'volunteer', 'reporter'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // 1. Fetch user from Clerk
    const clerkUser = await clerkClient.users.getUser(userId);
    
    // 2. Update Clerk Metadata
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: { role },
    });

    // 3. Try to upsert into Supabase users table (non-fatal if table doesn't exist yet)
    try {
      await supabase
        .from('users')
        .upsert(
          {
            clerk_id: userId,
            full_name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 'Unknown',
            email: clerkUser.emailAddresses[0]?.emailAddress,
            role,
          },
          { onConflict: 'clerk_id' }
        )
        .select('*')
        .single();
    } catch (dbErr) {
      // Log but don't fail — the Clerk metadata update already succeeded
      console.warn('[auth/sync] Supabase upsert failed (table may not exist yet):', dbErr);
    }

    return res.status(200).json({ ok: true, role });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/users', async (req, res) => {
  try {
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const clerkId = typeof req.query.clerk_id === 'string' ? req.query.clerk_id : undefined;

    let query = supabase.from('users').select('*').order('created_at', { ascending: false });
    if (role) query = query.eq('role', role);
    if (clerkId) query = query.eq('clerk_id', clerkId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return res.status(200).json({ data: data ?? [] });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/users/profile', async (req, res) => {
  try {
    const payload = upsertUserProfileSchema.parse(req.body);
    const row = {
      clerk_id: payload.clerk_id,
      role: payload.role,
      full_name: payload.full_name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
    };
    const { data, error } = await supabase
      .from('users')
      .upsert(row, { onConflict: 'clerk_id' })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return res.status(200).json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/needs', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const reporterClerkId = typeof req.query.reporter_clerk_id === 'string' ? req.query.reporter_clerk_id : undefined;

    let query = supabase
      .from('needs_report')
      .select('*')
      .order('urgency_score', { ascending: false })
      .order('created_at', { ascending: false });

    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        query = query.eq('status', statuses[0]);
      } else {
        query = (query as any).in('status', statuses);
      }
    }

    if (reporterClerkId) {
      query = query.eq('reporter_clerk_id', reporterClerkId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const unresolvedExisting = await supabase
      .from('needs_report')
      .select('*')
      .in('status', ['pending', 'open', 'task_created', 'task_completed']);
    if (unresolvedExisting.error) throw new Error(unresolvedExisting.error.message);
    const contextRows = unresolvedExisting.data ?? rows;
    const scored = rows.map((need) => buildNeedUrgencyView(need, contextRows));
    scored.sort((a, b) => b.urgency_score - a.urgency_score || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return res.status(200).json({ data: scored });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/needs', async (req, res) => {
  try {
    const payload = createNeedSchema.parse(req.body);
    const unresolvedExisting = await supabase
      .from('needs_report')
      .select('*')
      .in('status', ['pending', 'open', 'task_created', 'task_completed']);
    if (unresolvedExisting.error) throw new Error(unresolvedExisting.error.message);
    const newNeedForCluster = { ...payload, id: 'incoming', created_at: new Date().toISOString(), status: 'pending' };
    const clusterCount = countNearbyCluster(newNeedForCluster, unresolvedExisting.data ?? []);
    const evaluation = computeUrgencyEvaluation({
      severity: payload.severity_self,
      affectedCount: payload.affected_count,
      title: payload.title,
      description: payload.description,
      category: payload.category,
      hoursSinceCreated: 0,
      clusterCount,
      dataCompleteness: [
        Boolean(payload.title?.trim()),
        Boolean(payload.description?.trim()),
        Boolean(payload.location_text?.trim()),
        hasCoordinates(payload.lat, payload.lng),
        Array.isArray(payload.image_urls) && payload.image_urls.length > 0,
        payload.affected_count > 0,
      ].filter(Boolean).length / 6,
      consistencyScore:
        payload.severity_self === 'critical' && payload.affected_count < 3
          ? 0.55
          : payload.severity_self === 'low' && payload.affected_count > 250
          ? 0.55
          : 0.9,
    });
    const urgency = computeUrgencyScore({
      severity: payload.severity_self,
      affectedCount: payload.affected_count,
      title: payload.title,
      description: payload.description,
      category: payload.category,
      clusterCount,
    });

    const insertBody = {
      ...payload,
      urgency_score: urgency,
      urgency_confidence: evaluation.confidence,
      urgency_reasons: evaluation.reasons,
      status: 'pending',  // Always starts pending — coordinator must approve
    };

    const { data, error } = await supabase
      .from('needs_report')
      .insert(insertBody)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    return res.status(201).json({ data: buildNeedUrgencyView(data, [...(unresolvedExisting.data ?? []), data]) });
  } catch (error) {
    return handleError(res, error);
  }
});

/* ─────────────────────────────────────────────────────────────
   GET /needs/similar — Duplicate / similar-issue detection
   Query params:
     title          (required) current report title
     category       (required) category
     location_text  (required) human-readable address
     lat            (optional) float
     lng            (optional) float
     radius_km      (optional) max geo distance (default 25)
   Returns up to 5 similar active needs sorted by similarity score.
───────────────────────────────────────────────────────────── */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function wordSet(text: string): Set<string> {
  const stopwords = new Set(['a','an','the','in','on','at','of','for','to','is','and','or','with','near','by','from']);
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopwords.has(w))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter((w) => b.has(w)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

function hasCoordinates(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng);
}

function countNearbyCluster(need: any, allNeeds: any[]) {
  const unresolvedStatuses = new Set(['pending', 'open', 'task_created', 'task_completed']);
  return allNeeds.filter((n) => {
    if (n.id === need.id) return false;
    if (!unresolvedStatuses.has(n.status)) return false;
    if (n.category !== need.category) return false;

    if (hasCoordinates(need.lat, need.lng) && hasCoordinates(n.lat, n.lng)) {
      return haversineKm(need.lat, need.lng, n.lat, n.lng) <= 5;
    }
    const left = wordSet(need.location_text ?? '');
    const right = wordSet(n.location_text ?? '');
    return jaccardSimilarity(left, right) >= 0.5;
  }).length;
}

function buildNeedUrgencyView(need: any, allNeeds: any[]) {
  const hoursSinceCreated = Math.max(0, (Date.now() - new Date(need.created_at).getTime()) / (1000 * 60 * 60));
  const clusterCount = countNearbyCluster(need, allNeeds);
  const completenessSignals = [
    Boolean(need.title?.trim()),
    Boolean(need.description?.trim()),
    Boolean(need.location_text?.trim()),
    hasCoordinates(need.lat, need.lng),
    Array.isArray(need.image_urls) && need.image_urls.length > 0,
    typeof need.affected_count === 'number' && need.affected_count > 0,
  ];
  const dataCompleteness = completenessSignals.filter(Boolean).length / completenessSignals.length;
  const consistencyScore =
    need.severity_self === 'critical' && (need.affected_count ?? 0) < 3
      ? 0.55
      : need.severity_self === 'low' && (need.affected_count ?? 0) > 250
      ? 0.55
      : 0.9;

  const evaluation = computeUrgencyEvaluation({
    severity: need.severity_self,
    affectedCount: need.affected_count ?? 0,
    title: need.title ?? '',
    description: need.description ?? '',
    category: need.category,
    hoursSinceCreated,
    clusterCount,
    dataCompleteness,
    consistencyScore,
  });

  const effectiveScore = need.urgency_override_score != null ? Number(need.urgency_override_score) : evaluation.score;
  const effectiveReasons =
    need.urgency_override_score != null
      ? [
          ...(Array.isArray(need.urgency_reasons) ? need.urgency_reasons : evaluation.reasons),
          {
            label: `Manual override by ${need.urgency_override_by ?? 'Coordinator'}`,
            points: Number(need.urgency_override_score) - evaluation.score,
          },
        ]
      : evaluation.reasons;

  return {
    ...need,
    urgency_score: Number(Math.min(10, Math.max(0, effectiveScore)).toFixed(2)),
    urgency_confidence: need.urgency_confidence ?? evaluation.confidence,
    urgency_reasons: effectiveReasons,
    dynamic_components: {
      hoursSinceCreated: Number(hoursSinceCreated.toFixed(1)),
      clusterCount,
    },
  };
}

router.get('/needs/similar', async (req, res) => {
  try {
    const title         = typeof req.query.title         === 'string' ? req.query.title.trim()         : '';
    const category      = typeof req.query.category      === 'string' ? req.query.category.trim()      : '';
    const locationText  = typeof req.query.location_text === 'string' ? req.query.location_text.trim() : '';
    const lat           = typeof req.query.lat           === 'string' ? parseFloat(req.query.lat)      : null;
    const lng           = typeof req.query.lng           === 'string' ? parseFloat(req.query.lng)      : null;
    const radiusKm      = typeof req.query.radius_km     === 'string' ? parseFloat(req.query.radius_km) : 25;

    if (!title || !category) {
      return res.status(400).json({ error: 'title and category are required' });
    }

    // Fetch active needs (exclude resolved/rejected) from the last 90 days
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing, error } = await supabase
      .from('needs_report')
      .select('*')
      .in('status', ['pending', 'open', 'task_created'])
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    if (!existing || existing.length === 0) return res.status(200).json({ data: [] });

    const queryWords = wordSet(title + ' ' + locationText);
    const hasCoords  = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);

    type ScoredNeed = { need: typeof existing[0]; score: number; reasons: string[]; distanceKm: number | null };
    const results: ScoredNeed[] = [];

    for (const need of existing) {
      let score = 0;
      const reasons: string[] = [];
      let distanceKm: number | null = null;

      // 1. Category match (0–30 pts)
      if (need.category === category) {
        score += 30;
        reasons.push('Same category');
      }

      // 2. Title + location text word overlap (0–40 pts via Jaccard)
      const needWords = wordSet(need.title + ' ' + (need.location_text ?? ''));
      const jaccard   = jaccardSimilarity(queryWords, needWords);
      const textScore = Math.round(jaccard * 40);
      if (textScore > 0) {
        score += textScore;
        if (jaccard >= 0.3) reasons.push('Similar description');
      }

      // 3. Geographic proximity (0–40 pts)
      const needLat = typeof need.lat === 'number' ? need.lat : null;
      const needLng = typeof need.lng === 'number' ? need.lng : null;
      if (hasCoords && needLat != null && needLng != null) {
        distanceKm = haversineKm(lat!, lng!, needLat, needLng);
        if (distanceKm <= radiusKm) {
          const geoScore = Math.round((1 - distanceKm / radiusKm) * 40);
          score += geoScore;
          if (distanceKm < 2) reasons.push('Same area (< 2 km)');
          else if (distanceKm < 10) reasons.push(`Nearby (${distanceKm.toFixed(1)} km away)`);
          else reasons.push(`Within ${distanceKm.toFixed(0)} km`);
        }
      } else if (locationText && need.location_text) {
        // Fallback: location text word overlap
        const locWords     = wordSet(locationText);
        const needLocWords = wordSet(need.location_text);
        const locJaccard   = jaccardSimilarity(locWords, needLocWords);
        if (locJaccard >= 0.3) {
          score += Math.round(locJaccard * 25);
          reasons.push('Similar location');
        }
      }

      // Only include if minimum score threshold met (at least 2 matching signals)
      if (score >= 35 && reasons.length >= 1) {
        results.push({ need, score, reasons, distanceKm });
      }
    }

    // Sort by score desc, return top 5
    results.sort((a, b) => b.score - a.score);
    const top5 = results.slice(0, 5).map(({ need, score, reasons, distanceKm }) => ({
      id:            need.id,
      title:         need.title,
      category:      need.category,
      location_text: need.location_text,
      urgency_score: need.urgency_score,
      status:        need.status,
      affected_count: need.affected_count,
      created_at:    need.created_at,
      similarity_score: score,
      match_reasons: reasons,
      distance_km:   distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
    }));

    return res.status(200).json({ data: top5 });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/needs/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('needs_report')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Need not found' });
    const unresolvedExisting = await supabase
      .from('needs_report')
      .select('*')
      .in('status', ['pending', 'open', 'task_created', 'task_completed']);
    if (unresolvedExisting.error) throw new Error(unresolvedExisting.error.message);
    return res.status(200).json({ data: buildNeedUrgencyView(data, unresolvedExisting.data ?? [data]) });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/needs/:id/priority-override', async (req, res) => {
  try {
    const payload = needPriorityOverrideSchema.parse(req.body);
    const { data: need, error: fetchError } = await supabase
      .from('needs_report')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!need) return res.status(404).json({ error: 'Need not found' });

    const { data, error } = await supabase
      .from('needs_report')
      .update({
        urgency_override_score: payload.urgency_score,
        urgency_override_note: payload.note,
        urgency_override_by: payload.actor_label,
        urgency_override_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    const unresolvedExisting = await supabase
      .from('needs_report')
      .select('*')
      .in('status', ['pending', 'open', 'task_created', 'task_completed']);
    if (unresolvedExisting.error) throw new Error(unresolvedExisting.error.message);

    return res.status(200).json({ data: buildNeedUrgencyView(data, unresolvedExisting.data ?? [data]) });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/needs/:id/timeline', async (req, res) => {
  try {
    const { data: need, error: needError } = await supabase
      .from('needs_report')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (needError) throw new Error(needError.message);
    if (!need) return res.status(404).json({ error: 'Need not found' });

    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .select('id, title, status, approval_status, created_at, completed_at')
      .eq('report_id', need.id)
      .order('created_at', { ascending: true });
    if (taskError) throw new Error(taskError.message);

    const taskIds = (tasks ?? []).map((task) => task.id);
    const taskEventsResult = taskIds.length > 0
      ? await supabase
          .from('task_events')
          .select('task_id, actor_label, from_status, to_status, note, created_at')
          .in('task_id', taskIds)
          .order('created_at', { ascending: true })
      : { data: [], error: null as null };
    if (taskEventsResult.error) throw new Error(taskEventsResult.error.message);

    const assignmentResult = taskIds.length > 0
      ? await supabase
          .from('task_assignments')
          .select('task_id, volunteer_id, status, completion_note, created_at, completed_at')
          .in('task_id', taskIds)
          .order('created_at', { ascending: true })
      : { data: [], error: null as null };
    if (assignmentResult.error && assignmentResult.error.code !== '42P01') throw new Error(assignmentResult.error.message);

    const volunteerIds = [...new Set((assignmentResult.data ?? []).map((item) => item.volunteer_id))];
    let volunteerMap = new Map<string, { id: string; full_name: string; phone: string; email: string | null }>();
    if (volunteerIds.length > 0) {
      const volunteerRows = await supabase
        .from('volunteers')
        .select('id, full_name, phone, email')
        .in('id', volunteerIds);
      if (volunteerRows.error) throw new Error(volunteerRows.error.message);
      volunteerMap = new Map((volunteerRows.data ?? []).map((volunteer) => [volunteer.id, volunteer]));
    }

    const timeline: Array<{
      type: 'created' | 'approved' | 'task_created' | 'assigned' | 'completed' | 'verified';
      title: string;
      timestamp: string | null;
      actor_label: string | null;
      note: string | null;
      task_id: string | null;
      task_title: string | null;
    }> = [];

    timeline.push({
      type: 'created',
      title: 'Need created',
      timestamp: need.created_at,
      actor_label: need.reporter_clerk_id ? 'Field Reporter' : null,
      note: need.title,
      task_id: null,
      task_title: null,
    });

    if (need.approved_at) {
      timeline.push({
        type: 'approved',
        title: 'Need approved',
        timestamp: need.approved_at,
        actor_label: 'Coordinator',
        note: need.rejection_note ? null : 'Approved for task creation',
        task_id: null,
        task_title: null,
      });
    }

    for (const task of tasks ?? []) {
      timeline.push({
        type: 'task_created',
        title: 'Task created',
        timestamp: task.created_at,
        actor_label: 'Field Reporter',
        note: task.title,
        task_id: task.id,
        task_title: task.title,
      });

      const taskAssignments = (assignmentResult.data ?? []).filter((item) => item.task_id === task.id);
      for (const assignment of taskAssignments) {
        const volunteer = volunteerMap.get(assignment.volunteer_id);
        timeline.push({
          type: 'assigned',
          title: 'Volunteer assigned',
          timestamp: assignment.created_at,
          actor_label: volunteer?.full_name ?? assignment.volunteer_id,
          note: assignment.status === 'completed' ? 'Completed assignment' : 'Accepted assignment',
          task_id: task.id,
          task_title: task.title,
        });

        if (assignment.completed_at) {
          timeline.push({
            type: 'completed',
            title: 'Volunteer completed',
            timestamp: assignment.completed_at,
            actor_label: volunteer?.full_name ?? assignment.volunteer_id,
            note: assignment.completion_note,
            task_id: task.id,
            task_title: task.title,
          });
        }
      }

      const taskEvents = (taskEventsResult.data ?? []).filter((event) => event.task_id === task.id);
      for (const event of taskEvents) {
        if (event.to_status === 'verified') {
          timeline.push({
            type: 'verified',
            title: 'Task verified',
            timestamp: event.created_at,
            actor_label: event.actor_label,
            note: event.note,
            task_id: task.id,
            task_title: task.title,
          });
        }
      }
    }

    timeline.sort((a, b) => {
      const left = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const right = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return left - right;
    });

    const parsedTimeline = timeline.map((entry) => needTimelineEntrySchema.parse(entry));
    return res.status(200).json({ data: parsedTimeline });
  } catch (error) {
    return handleError(res, error);
  }
});

// Coordinator approves a pending need → status becomes 'open'
router.post('/needs/:id/approve', async (req, res) => {
  try {
    const { data: need, error: fetchError } = await supabase
      .from('needs_report').select('status').eq('id', req.params.id).maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!need) return res.status(404).json({ error: 'Need not found' });
    if (need.status !== 'pending') return res.status(400).json({ error: `Cannot approve a need with status '${need.status}'` });

    const { data, error } = await supabase
      .from('needs_report')
      .update({ status: 'open', rejection_note: null, approved_at: new Date().toISOString(), rejected_at: null })
      .eq('id', req.params.id)
      .select('*').single();
    if (error) throw new Error(error.message);
    return res.status(200).json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

// Coordinator rejects a pending need → status becomes 'rejected'
router.post('/needs/:id/reject', async (req, res) => {
  try {
    const rejectionNote = typeof req.body.rejection_note === 'string' ? req.body.rejection_note : '';

    const { data: need, error: fetchError } = await supabase
      .from('needs_report').select('status').eq('id', req.params.id).maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!need) return res.status(404).json({ error: 'Need not found' });
    if (need.status !== 'pending') return res.status(400).json({ error: `Cannot reject a need with status '${need.status}'` });

    const { data, error } = await supabase
      .from('needs_report')
      .update({ status: 'rejected', rejection_note: rejectionNote, rejected_at: new Date().toISOString(), approved_at: null })
      .eq('id', req.params.id)
      .select('*').single();
    if (error) throw new Error(error.message);
    return res.status(200).json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/volunteers', async (_req, res) => {
  try {
    const approvalStatus = typeof _req.query.approval_status === 'string' ? _req.query.approval_status : undefined;
    const clerkId = typeof _req.query.clerk_id === 'string' ? _req.query.clerk_id : undefined;
    const statuses = approvalStatus
      ? approvalStatus.split(',').map((status) => status.trim()).filter(Boolean)
      : [];
    const applyApprovalFilter = <T>(query: T): T => {
      if (statuses.length === 1) {
        return (query as any).eq('approval_status', statuses[0]);
      }
      if (statuses.length > 1) {
        return (query as any).in('approval_status', statuses);
      }
      return query;
    };

    if (!clerkId) {
      const query = applyApprovalFilter(
        supabase.from('volunteers').select('*').order('created_at', { ascending: false })
      );
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return res.status(200).json({ data: data ?? [] });
    }

    const primaryQuery = applyApprovalFilter(
      supabase
        .from('volunteers')
        .select('*')
        .eq('clerk_id', clerkId)
        .order('created_at', { ascending: false })
    );
    const primaryResult = await primaryQuery;
    if (!primaryResult.error) {
      return res.status(200).json({ data: primaryResult.data ?? [] });
    }
    if (!isMissingColumnError(primaryResult.error, 'volunteers', 'clerk_id')) {
      throw new Error(primaryResult.error.message);
    }

    // Backward compatibility for DBs that haven't added volunteers.clerk_id yet.
    const fallbackQuery = applyApprovalFilter(
      supabase
        .from('volunteers')
        .select('*')
        .eq('email', clerkId)
        .order('created_at', { ascending: false })
    );
    const fallbackResult = await fallbackQuery;
    if (fallbackResult.error) throw new Error(fallbackResult.error.message);
    return res.status(200).json({ data: fallbackResult.data ?? [] });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/analytics/overview', async (_req, res) => {
  try {
    const [needsResult, tasksResult, volunteersResult, eventsResult] = await Promise.all([
      supabase
        .from('needs_report')
        .select('*'),
      supabase
        .from('tasks')
        .select('*'),
      supabase
        .from('volunteers')
        .select('*'),
      supabase
        .from('task_events')
        .select('id, actor_label, to_status, created_at, note')
        .order('created_at', { ascending: false }),
    ]);

    if (needsResult.error) throw needsResult.error;
    if (tasksResult.error) throw tasksResult.error;
    if (volunteersResult.error) throw volunteersResult.error;
    // Older DB snapshots may not have task_events yet; analytics can still render without it.
    if (eventsResult.error && eventsResult.error.code !== '42P01') throw eventsResult.error;

    const needs = needsResult.data ?? [];
    const tasks = tasksResult.data ?? [];
    const volunteers = volunteersResult.data ?? [];
    const taskEvents = eventsResult.error?.code === '42P01' ? [] : (eventsResult.data ?? []);
    const now = new Date();

    const taskStatusOrder = ['open', 'assigned', 'in_progress', 'completed', 'verified'];
    const needStatusOrder = ['pending', 'open', 'rejected', 'task_created', 'resolved'];
    const categoryOrder = ['water', 'health', 'food', 'shelter', 'education', 'other'];

    const taskStatusCounts = new Map(taskStatusOrder.map((status) => [status, 0]));
    const needStatusCounts = new Map(needStatusOrder.map((status) => [status, 0]));
    const categoryCounts = new Map(categoryOrder.map((category) => [category, 0]));
    const urgencyBands = new Map([
      ['Low', 0],
      ['Moderate', 0],
      ['High', 0],
      ['Critical', 0],
    ]);

    for (const need of needs) {
      needStatusCounts.set(need.status, (needStatusCounts.get(need.status) ?? 0) + 1);
      categoryCounts.set(need.category, (categoryCounts.get(need.category) ?? 0) + 1);

      const urgency = Number(need.urgency_score ?? 0);
      if (urgency >= 7) urgencyBands.set('Critical', (urgencyBands.get('Critical') ?? 0) + 1);
      else if (urgency >= 4) urgencyBands.set('High', (urgencyBands.get('High') ?? 0) + 1);
      else if (urgency >= 2) urgencyBands.set('Moderate', (urgencyBands.get('Moderate') ?? 0) + 1);
      else urgencyBands.set('Low', (urgencyBands.get('Low') ?? 0) + 1);
    }

    for (const task of tasks) {
      taskStatusCounts.set(task.status, (taskStatusCounts.get(task.status) ?? 0) + 1);
    }

    const openNeeds = needs.filter((need) => need.status === 'open');
    const unresolvedCriticalNeeds = needs.filter(
      (need) => need.status !== 'resolved' && Number(need.urgency_score ?? 0) >= 7
    ).length;
    const activeTasks = tasks.filter((task) => ['open', 'assigned', 'in_progress'].includes(task.status)).length;
    const overdueTasks = tasks.filter(
      (task) =>
        ['open', 'assigned', 'in_progress'].includes(task.status) &&
        new Date(task.deadline).getTime() < now.getTime()
    ).length;
    const verifiedTasks = tasks.filter((task) => task.status === 'verified').length;
    const verifiedCompletionRate = tasks.length === 0 ? 0 : round((verifiedTasks / tasks.length) * 100);
    const averageOpenUrgency =
      openNeeds.length === 0
        ? 0
        : round(
            openNeeds.reduce((sum, need) => sum + Number(need.urgency_score ?? 0), 0) / openNeeds.length,
            2
          );

    const totalSlots = volunteers.reduce((sum, volunteer) => sum + volunteer.max_tasks, 0);
    const usedSlots = volunteers.reduce((sum, volunteer) => sum + volunteer.active_tasks, 0);
    const activeVolunteers = volunteers.filter(
      (volunteer) => volunteer.approval_status === 'approved' && volunteer.is_active
    ).length;
    const inactiveVolunteers = volunteers.length - activeVolunteers;
    const availableVolunteers = volunteers.filter(
      (volunteer) =>
        volunteer.approval_status === 'approved' &&
        volunteer.is_active &&
        volunteer.active_tasks < volunteer.max_tasks
    ).length;
    const volunteerUtilizationRate = totalSlots === 0 ? 0 : round((usedSlots / totalSlots) * 100);

    const days = 14;
    const dailyFlowMap = new Map<string, { day: string; needsCreated: number; tasksCreated: number; tasksCompleted: number; tasksVerified: number }>();
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const day = new Date(now);
      day.setUTCHours(0, 0, 0, 0);
      day.setUTCDate(day.getUTCDate() - offset);
      const key = day.toISOString().slice(0, 10);
      dailyFlowMap.set(key, {
        day: key,
        needsCreated: 0,
        tasksCreated: 0,
        tasksCompleted: 0,
        tasksVerified: 0,
      });
    }

    for (const need of needs) {
      const bucket = dailyFlowMap.get(dayKey(need.created_at));
      if (bucket) bucket.needsCreated += 1;
    }

    for (const task of tasks) {
      const createdBucket = dailyFlowMap.get(dayKey(task.created_at));
      if (createdBucket) createdBucket.tasksCreated += 1;

      if (task.completed_at) {
        const completedBucket = dailyFlowMap.get(dayKey(task.completed_at));
        if (completedBucket) completedBucket.tasksCompleted += 1;
      }
    }

    for (const event of taskEvents) {
      if (event.to_status !== 'verified') continue;
      const verifiedBucket = dailyFlowMap.get(dayKey(event.created_at));
      if (verifiedBucket) verifiedBucket.tasksVerified += 1;
    }

    const skillSupply = new Map<string, number>();
    const skillDemand = new Map<string, number>();

    for (const volunteer of volunteers) {
      if (volunteer.approval_status !== 'approved' || !volunteer.is_active) continue;
      for (const skill of volunteer.skills ?? []) {
        const normalized = skill.trim().toLowerCase();
        if (!normalized) continue;
        skillSupply.set(normalized, (skillSupply.get(normalized) ?? 0) + 1);
      }
    }

    for (const task of tasks) {
      if (!['open', 'assigned', 'in_progress'].includes(task.status)) continue;
      for (const skill of task.required_skills ?? []) {
        const normalized = skill.trim().toLowerCase();
        if (!normalized) continue;
        skillDemand.set(normalized, (skillDemand.get(normalized) ?? 0) + 1);
      }
    }

    const skillSet = new Set([...skillSupply.keys(), ...skillDemand.keys()]);
    const skillBalance = [...skillSet]
      .map((skill) => {
        const supply = skillSupply.get(skill) ?? 0;
        const demand = skillDemand.get(skill) ?? 0;
        return {
          skill,
          supply,
          demand,
          gap: demand - supply,
        };
      })
      .sort((a, b) => {
        if (b.gap !== a.gap) return b.gap - a.gap;
        if (b.demand !== a.demand) return b.demand - a.demand;
        return a.skill.localeCompare(b.skill);
      })
      .slice(0, 8);

    const topVolunteers = [...volunteers]
      .sort((a, b) => {
        if (b.total_deployments !== a.total_deployments) return b.total_deployments - a.total_deployments;
        if (b.active_tasks !== a.active_tasks) return b.active_tasks - a.active_tasks;
        return a.full_name.localeCompare(b.full_name);
      })
      .slice(0, 5)
      .map((volunteer) => ({
        id: volunteer.id,
        full_name: volunteer.full_name,
        total_deployments: volunteer.total_deployments,
        active_tasks: volunteer.active_tasks,
        max_tasks: volunteer.max_tasks,
        is_active: volunteer.is_active,
      }));

    return res.status(200).json({
      data: {
        summary: {
          openNeeds: openNeeds.length,
          unresolvedCriticalNeeds,
          activeTasks,
          overdueTasks,
          verifiedCompletionRate,
          averageOpenUrgency,
          volunteerUtilizationRate,
          availableVolunteers,
        },
        taskStatus: taskStatusOrder.map((status) => ({
          label: status.replace('_', ' '),
          value: taskStatusCounts.get(status) ?? 0,
        })),
        needStatus: needStatusOrder.map((status) => ({
          label: status.replace('_', ' '),
          value: needStatusCounts.get(status) ?? 0,
        })),
        needsByCategory: categoryOrder.map((category) => ({
          label: category,
          value: categoryCounts.get(category) ?? 0,
        })),
        urgencyBands: [...urgencyBands.entries()].map(([label, value]) => ({
          label,
          value,
        })),
        dailyFlow: [...dailyFlowMap.values()],
        volunteerCapacity: {
          activeVolunteers,
          inactiveVolunteers,
          totalSlots,
          usedSlots,
        },
        skillBalance,
        topVolunteers,
        recentTaskEvents: taskEvents.slice(0, 6),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/volunteers', async (req, res) => {
  try {
    const payload = createVolunteerSchema.parse(req.body);
    const normalizedClerkId = payload.clerk_id?.trim() || null;
    const normalizedEmail = payload.email?.trim().toLowerCase() || null;

    let existingVolunteer:
      | {
          id: string;
          clerk_id?: string | null;
          email: string | null;
          approval_status: string;
        }
      | null = null;
    let hasClerkIdColumn = true;

    if (normalizedClerkId) {
      const { data, error } = await supabase
        .from('volunteers')
        .select('id, clerk_id, email, approval_status')
        .eq('clerk_id', normalizedClerkId)
        .maybeSingle();
      if (error) {
        if (isMissingColumnError(error, 'volunteers', 'clerk_id')) {
          hasClerkIdColumn = false;
        } else {
          throw error;
        }
      } else {
        existingVolunteer = data;
      }
    }

    if (!existingVolunteer && normalizedEmail) {
      const { data, error } = await supabase
        .from('volunteers')
        .select('id, email, approval_status')
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (error) throw error;
      existingVolunteer = data;
    }

    if (existingVolunteer?.approval_status === 'approved') {
      return res.status(409).json({
        error: `A volunteer with email ${normalizedEmail || existingVolunteer.email || 'this account'} is already approved.`,
      });
    }

    if (existingVolunteer?.approval_status === 'pending') {
      return res.status(409).json({
        error: 'This volunteer registration is already pending coordinator review.',
      });
    }

    const volunteerPayload: Record<string, unknown> = {
      ...payload,
      email: normalizedEmail,
      approval_status: 'pending',
      rejection_note: null,
      is_active: false,
      active_tasks: 0,
      total_deployments: 0,
    };
    if (hasClerkIdColumn) {
      volunteerPayload.clerk_id = normalizedClerkId;
    }

    if (existingVolunteer?.approval_status === 'rejected') {
      let updateQuery = supabase
        .from('volunteers')
        .update(volunteerPayload)
        .eq('id', existingVolunteer.id);
      let updateResult = await updateQuery.select('*').single();
      if (updateResult.error && hasClerkIdColumn && isMissingColumnError(updateResult.error, 'volunteers', 'clerk_id')) {
        delete volunteerPayload.clerk_id;
        hasClerkIdColumn = false;
        updateResult = await supabase
          .from('volunteers')
          .update(volunteerPayload)
          .eq('id', existingVolunteer.id)
          .select('*')
          .single();
      }

      if (updateResult.error) throw updateResult.error;
      return res.status(200).json({ data: updateResult.data });
    }

    let insertResult = await supabase
      .from('volunteers')
      .insert(volunteerPayload)
      .select('*')
      .single();
    if (insertResult.error && hasClerkIdColumn && isMissingColumnError(insertResult.error, 'volunteers', 'clerk_id')) {
      delete volunteerPayload.clerk_id;
      insertResult = await supabase
        .from('volunteers')
        .insert(volunteerPayload)
        .select('*')
        .single();
    }

    if (insertResult.error) throw insertResult.error;
    return res.status(201).json({ data: insertResult.data });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/volunteers/:id/approve', async (req, res) => {
  try {
    const { data: volunteer, error: fetchError } = await supabase
      .from('volunteers')
      .select('approval_status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found' });
    if (volunteer.approval_status !== 'pending') {
      return res.status(400).json({ error: `Cannot approve a volunteer with status '${volunteer.approval_status}'` });
    }

    const { data, error } = await supabase
      .from('volunteers')
      .update({
        approval_status: 'approved',
        rejection_note: null,
        is_active: true,
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    return res.status(200).json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/volunteers/:id/reject', async (req, res) => {
  try {
    const payload = rejectVolunteerSchema.parse(req.body);
    const { data: volunteer, error: fetchError } = await supabase
      .from('volunteers')
      .select('approval_status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found' });
    if (volunteer.approval_status !== 'pending') {
      return res.status(400).json({ error: `Cannot reject a volunteer with status '${volunteer.approval_status}'` });
    }

    const { data, error } = await supabase
      .from('volunteers')
      .update({
        approval_status: 'rejected',
        rejection_note: payload.rejection_note,
        is_active: false,
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    return res.status(200).json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/volunteer-requests', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const volunteerId = typeof req.query.volunteer_id === 'string' ? req.query.volunteer_id : undefined;

    let query = supabase
      .from('volunteer_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (volunteerId) {
      query = query.eq('volunteer_id', volunteerId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return res.status(200).json({ data: data ?? [] });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/volunteer-requests', async (req, res) => {
  try {
    const payload = createVolunteerRequestSchema.parse(req.body);

    const { data: volunteer, error: volunteerError } = await supabase
      .from('volunteers')
      .select('id, approval_status, is_active, active_tasks, max_tasks')
      .eq('id', payload.volunteer_id)
      .maybeSingle();
    if (volunteerError) throw new Error(volunteerError.message);
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found' });
    if (volunteer.approval_status !== 'approved' || !volunteer.is_active) {
      return res.status(400).json({ error: 'Volunteer must be approved and active to request participation' });
    }

    if (payload.task_id) {
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, status, assigned_to, approval_status')
        .eq('id', payload.task_id)
        .maybeSingle();
      if (taskError) throw new Error(taskError.message);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (task.approval_status !== 'approved') {
        return res.status(400).json({ error: 'Task must be admin approved before volunteer requests' });
      }
      if (!['open', 'assigned', 'in_progress'].includes(task.status)) {
        return res.status(400).json({ error: 'This task is not open for participation requests' });
      }
    }

    if (payload.need_id) {
      const { data: need, error: needError } = await supabase
        .from('needs_report')
        .select('id, status')
        .eq('id', payload.need_id)
        .maybeSingle();
      if (needError) throw new Error(needError.message);
      if (!need) return res.status(404).json({ error: 'Need not found' });
      if (!['open', 'task_created'].includes(need.status)) {
        return res.status(400).json({ error: 'This need is not open for participation' });
      }
    }

    let duplicateQuery = supabase
      .from('volunteer_requests')
      .select('id')
      .eq('volunteer_id', payload.volunteer_id)
      .eq('status', 'pending');
    if (payload.task_id) duplicateQuery = duplicateQuery.eq('task_id', payload.task_id);
    if (payload.need_id) duplicateQuery = duplicateQuery.eq('need_id', payload.need_id);
    const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
    if (duplicateError) throw new Error(duplicateError.message);
    if (duplicate) return res.status(409).json({ error: 'A pending request already exists for this cause' });

    const { data, error } = await supabase
      .from('volunteer_requests')
      .insert({
        volunteer_id: payload.volunteer_id,
        need_id: payload.need_id ?? null,
        task_id: payload.task_id ?? null,
        note: payload.note,
        status: 'pending',
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return res.status(201).json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/volunteer-requests/:id/approve', async (req, res) => {
  try {
    const { data: requestRow, error: requestError } = await supabase
      .from('volunteer_requests')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!requestRow) return res.status(404).json({ error: 'Request not found' });
    if (requestRow.status !== 'pending') return res.status(400).json({ error: 'Request is already decided' });

    const { data: volunteer, error: volunteerError } = await supabase
      .from('volunteers')
      .select('*')
      .eq('id', requestRow.volunteer_id)
      .maybeSingle();
    if (volunteerError) throw new Error(volunteerError.message);
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found' });
    if (volunteer.approval_status !== 'approved' || !volunteer.is_active || volunteer.active_tasks >= volunteer.max_tasks) {
      return res.status(400).json({ error: 'Volunteer is not currently eligible for assignment' });
    }

    if (requestRow.task_id) {
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', requestRow.task_id)
        .maybeSingle();
      if (taskError) throw new Error(taskError.message);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      await assignVolunteerToTask({
        task: {
          id: task.id,
          status: task.status,
          assigned_to: task.assigned_to,
        },
        volunteer: {
          id: volunteer.id,
          active_tasks: volunteer.active_tasks,
          max_tasks: volunteer.max_tasks,
          approval_status: volunteer.approval_status,
          is_active: volunteer.is_active,
        },
        actorLabel: 'Coordinator',
        note: `Assigned by approving volunteer request ${requestRow.id}`,
      });
    }

    const { data: updatedRequest, error: requestUpdateError } = await supabase
      .from('volunteer_requests')
      .update({
        status: 'approved',
        decided_at: new Date().toISOString(),
      })
      .eq('id', requestRow.id)
      .select('*')
      .single();
    if (requestUpdateError) throw new Error(requestUpdateError.message);

    return res.status(200).json({ data: updatedRequest });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/volunteer-requests/:id/reject', async (req, res) => {
  try {
    const payload = rejectVolunteerRequestSchema.parse(req.body);
    const { data: requestRow, error: requestError } = await supabase
      .from('volunteer_requests')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!requestRow) return res.status(404).json({ error: 'Request not found' });
    if (requestRow.status !== 'pending') return res.status(400).json({ error: 'Request is already decided' });

    const { data, error } = await supabase
      .from('volunteer_requests')
      .update({
        status: 'rejected',
        coordinator_note: payload.coordinator_note,
        decided_at: new Date().toISOString(),
      })
      .eq('id', requestRow.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return res.status(200).json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const volunteerId = typeof req.query.volunteer_id === 'string' ? req.query.volunteer_id : undefined;
    const reportId = typeof req.query.report_id === 'string' ? req.query.report_id : undefined;
    const approvalStatus = typeof req.query.approval_status === 'string' ? req.query.approval_status : undefined;

    let query = supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (reportId) {
      query = query.eq('report_id', reportId);
    }
    if (approvalStatus) {
      query = query.eq('approval_status', approvalStatus);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    let tasks = data ?? [];

    if (volunteerId) {
      const assignmentResult = await supabase
        .from('task_assignments')
        .select('task_id, status, completion_note, completed_at')
        .eq('volunteer_id', volunteerId);
      const assignmentRows = assignmentResult.error?.code === '42P01' ? [] : (assignmentResult.data ?? []);
      if (assignmentResult.error && assignmentResult.error.code !== '42P01') {
        throw new Error(assignmentResult.error.message);
      }
      const byTaskId = new Map(
        assignmentRows.map((item) => [
          item.task_id,
          {
            participant_status: item.status,
            participant_completion_note: item.completion_note,
            participant_completed_at: item.completed_at,
          },
        ])
      );
      tasks = tasks
        .filter((task) => byTaskId.has(task.id) || task.assigned_to === volunteerId)
        .map((task) => ({
          ...task,
          ...(byTaskId.get(task.id) ??
            (task.assigned_to === volunteerId
              ? {
                  participant_status: ['completed', 'verified'].includes(task.status) ? 'completed' : 'assigned',
                  participant_completion_note: task.completion_note ?? null,
                  participant_completed_at: task.completed_at ?? null,
                }
              : {})),
        }));
    }

    return res.status(200).json({ data: tasks });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/tasks/recommended', async (req, res) => {
  try {
    const volunteerId = typeof req.query.volunteer_id === 'string' ? req.query.volunteer_id : undefined;
    if (!volunteerId) return res.status(400).json({ error: 'volunteer_id is required' });

    const { data: volunteer, error: volunteerError } = await supabase
      .from('volunteers')
      .select('*')
      .eq('id', volunteerId)
      .maybeSingle();
    if (volunteerError) throw new Error(volunteerError.message);
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found' });
    if (volunteer.approval_status !== 'approved' || !volunteer.is_active) {
      return res.status(400).json({ error: 'Volunteer must be approved and active' });
    }

    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'open')
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false });
    if (tasksError) throw new Error(tasksError.message);

    const requestResult = await supabase
      .from('volunteer_requests')
      .select('task_id, status')
      .eq('volunteer_id', volunteer.id);
    if (requestResult.error) throw new Error(requestResult.error.message);
    const excludedTaskIds = new Set(
      (requestResult.data ?? [])
        .filter((item) => item.task_id && ['pending', 'approved'].includes(item.status))
        .map((item) => item.task_id as string)
    );

    const assignmentResult = await supabase
      .from('task_assignments')
      .select('task_id')
      .eq('volunteer_id', volunteer.id);
    if (assignmentResult.error && assignmentResult.error.code !== '42P01') {
      throw new Error(assignmentResult.error.message);
    }
    for (const row of assignmentResult.data ?? []) {
      if (row.task_id) excludedTaskIds.add(row.task_id);
    }

    const candidateTasks = (tasks ?? []).filter((task) => !excludedTaskIds.has(task.id));
    const ranked = rankTasksForVolunteer(volunteer, candidateTasks).slice(0, 8);

    const reportIds = [...new Set(candidateTasks.map((task) => task.report_id))];
    let needsMap = new Map<string, { id: string; title: string }>();
    if (reportIds.length > 0) {
      const needResult = await supabase
        .from('needs_report')
        .select('id, title')
        .in('id', reportIds);
      if (needResult.error) throw new Error(needResult.error.message);
      needsMap = new Map((needResult.data ?? []).map((need) => [need.id, need]));
    }

    return res.status(200).json({
      data: ranked.map((item) => {
        const fullTask = candidateTasks.find((task) => task.id === item.task.id);
        const need = fullTask ? needsMap.get(fullTask.report_id) : undefined;
        return {
          ...item,
          task: {
            ...(fullTask ?? item.task),
            need_title: need?.title ?? null,
          },
        };
      }),
    });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/tasks', async (req, res) => {
  try {
    const payload = createTaskSchema.parse(req.body);

    const { data: linkedNeed, error: needError } = await supabase
      .from('needs_report')
      .select('*')
      .eq('id', payload.report_id)
      .maybeSingle();

    if (needError) throw new Error(needError.message);
    if (!linkedNeed) return res.status(404).json({ error: 'Linked need not found' });
    if (!['open', 'task_created'].includes(linkedNeed.status)) {
      return res.status(400).json({ error: `Cannot create task for need status '${linkedNeed.status}'. Need must be approved first.` });
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        ...payload,
        status: 'open',
        approval_status: 'approved',
        rejection_note: null,
        reporter_clerk_id: payload.reporter_clerk_id ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    await addTaskEvent({
      task_id: data.id,
      actor_label: payload.reporter_clerk_id ? 'Field Reporter' : 'Coordinator',
      from_status: null,
      to_status: 'open',
      note: `Task created from approved need: ${payload.report_id}`,
    });

    const { error: needUpdateError } = await supabase
      .from('needs_report')
      .update({ status: 'task_created' })
      .eq('id', payload.report_id);
    if (needUpdateError) throw new Error(needUpdateError.message);

    return res.status(201).json({ data, matches: [] });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/tasks/:id/approve', async (req, res) => {
  try {
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (taskError) throw new Error(taskError.message);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.approval_status !== 'pending') {
      return res.status(400).json({ error: `Cannot approve a task with status '${task.approval_status}'` });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({ approval_status: 'approved', rejection_note: null })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    const { error: needUpdateError } = await supabase
      .from('needs_report')
      .update({ status: 'task_created' })
      .eq('id', task.report_id);
    if (needUpdateError) throw new Error(needUpdateError.message);

    await addTaskEvent({
      task_id: task.id,
      actor_label: 'Coordinator',
      from_status: task.status,
      to_status: task.status,
      note: 'Task approved by admin',
    });

    return res.status(200).json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/tasks/:id/reject', async (req, res) => {
  try {
    const payload = rejectTaskSchema.parse(req.body);
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (taskError) throw new Error(taskError.message);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.approval_status !== 'pending') {
      return res.status(400).json({ error: `Cannot reject a task with status '${task.approval_status}'` });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({ approval_status: 'rejected', rejection_note: payload.rejection_note })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    await addTaskEvent({
      task_id: task.id,
      actor_label: 'Coordinator',
      from_status: task.status,
      to_status: task.status,
      note: `Task rejected by admin. ${payload.rejection_note}`,
    });

    return res.status(200).json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/tasks/:id', async (req, res) => {
  try {
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (taskError) throw new Error(taskError.message);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const [eventResult, volunteerResult, needResult, assignmentResult] = await Promise.all([
      supabase
        .from('task_events')
        .select('*')
        .eq('task_id', task.id)
        .order('created_at', { ascending: true }),
      task.assigned_to
        ? supabase.from('volunteers').select('*').eq('id', task.assigned_to).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from('needs_report').select('*').eq('id', task.report_id).maybeSingle(),
      getTaskAssignments(task.id),
    ]);

    if (eventResult.error) throw new Error(eventResult.error.message);
    if (volunteerResult.error) throw new Error(volunteerResult.error.message);
    if (needResult.error) throw new Error(needResult.error.message);
    if (assignmentResult.error && assignmentResult.error.code !== '42P01') throw new Error(assignmentResult.error.message);

    const assignmentRows =
      assignmentResult.error?.code === '42P01'
        ? task.assigned_to
          ? [{ id: `legacy-${task.id}`, task_id: task.id, volunteer_id: task.assigned_to, status: ['completed', 'verified'].includes(task.status) ? 'completed' : 'assigned', completion_note: task.completion_note, completed_at: task.completed_at, created_at: task.created_at }]
          : []
        : (assignmentResult.data ?? []);
    const assignmentVolunteerIds = [...new Set(assignmentRows.map((item) => item.volunteer_id))];
    let assignmentVolunteers: Array<{ id: string; full_name: string; phone: string; email: string | null }> = [];
    if (assignmentVolunteerIds.length > 0) {
      const volunteerRowsResult = await supabase
        .from('volunteers')
        .select('id, full_name, phone, email')
        .in('id', assignmentVolunteerIds);
      if (volunteerRowsResult.error) throw new Error(volunteerRowsResult.error.message);
      assignmentVolunteers = volunteerRowsResult.data ?? [];
    }
    const volunteerById = new Map(assignmentVolunteers.map((item) => [item.id, item]));
    const participants = assignmentRows.map((assignment) => ({
      ...assignment,
      volunteer: volunteerById.get(assignment.volunteer_id) ?? null,
    }));

    return res.status(200).json({
      data: {
        ...task,
        assigned_volunteer: volunteerResult.data,
        participants,
        events: eventResult.data ?? [],
        linked_need: needResult.data,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/tasks/:id/matches', async (req, res) => {
  try {
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (taskError) throw new Error(taskError.message);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { data: volunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select('*')
      .eq('approval_status', 'approved')
      .eq('is_active', true);

    if (volunteersError) throw new Error(volunteersError.message);

    const matches = rankMatches(task, volunteers ?? []);

    return res.status(200).json({ data: matches });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/tasks/:id/assign', async (req, res) => {
  try {
    const payload = assignTaskSchema.parse(req.body);

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (taskError) throw new Error(taskError.message);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { data: volunteer, error: volunteerError } = await supabase
      .from('volunteers')
      .select('*')
      .eq('id', payload.volunteer_id)
      .maybeSingle();
    if (volunteerError) throw new Error(volunteerError.message);
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found' });
    await assignVolunteerToTask({
      task: {
        id: task.id,
        status: task.status,
        assigned_to: task.assigned_to,
      },
      volunteer: {
        id: volunteer.id,
        active_tasks: volunteer.active_tasks,
        max_tasks: volunteer.max_tasks,
        approval_status: volunteer.approval_status,
        is_active: volunteer.is_active,
      },
      actorLabel: payload.actor_label,
      note: `Volunteer assigned: ${payload.volunteer_id}`,
    });

    const { data: updatedTask, error: updatedTaskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (updatedTaskError) throw new Error(updatedTaskError.message);
    return res.status(200).json({ data: updatedTask });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/tasks/:id/complete-by-volunteer', async (req, res) => {
  try {
    const payload = completeTaskByVolunteerSchema.parse(req.body);

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (taskError) throw new Error(taskError.message);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!['assigned', 'in_progress'].includes(task.status)) {
      return res.status(400).json({ error: `Task cannot accept volunteer completion in status ${task.status}` });
    }

    let assignmentResult = await supabase
      .from('task_assignments')
      .select('*')
      .eq('task_id', task.id)
      .eq('volunteer_id', payload.volunteer_id)
      .maybeSingle();
    const assignmentsTableMissing = assignmentResult.error?.code === '42P01';
    if (assignmentResult.error && !assignmentsTableMissing) throw new Error(assignmentResult.error.message);
    if (!assignmentResult.data && !assignmentsTableMissing) {
      if (task.assigned_to !== payload.volunteer_id) {
        return res.status(404).json({ error: 'You are not assigned to this task' });
      }
      const insertResult = await supabase
        .from('task_assignments')
        .insert({
          task_id: task.id,
          volunteer_id: payload.volunteer_id,
          status: 'assigned',
        })
        .select('*')
        .single();
      if (insertResult.error && insertResult.error.code !== '42P01') throw new Error(insertResult.error.message);
      assignmentResult = { data: insertResult.data, error: insertResult.error } as typeof assignmentResult;
    }
    if (!assignmentResult.data && assignmentsTableMissing && task.assigned_to !== payload.volunteer_id) {
      return res.status(404).json({ error: 'You are not assigned to this task' });
    }
    if (assignmentResult.data?.status === 'completed') {
      return res.status(400).json({ error: 'Your completion is already recorded for this task' });
    }

    if (task.status === 'assigned') {
      await addTaskEvent({
        task_id: task.id,
        actor_label: payload.actor_label,
        from_status: 'assigned',
        to_status: 'in_progress',
        note: 'Task moved to in_progress after volunteer progress update',
      });
    }

    const now = new Date().toISOString();
    if (!assignmentsTableMissing && assignmentResult.data) {
      const { error: assignmentUpdateError } = await supabase
        .from('task_assignments')
        .update({
          status: 'completed',
          completion_note: payload.completion_note,
          completed_at: now,
        })
        .eq('id', assignmentResult.data.id);
      if (assignmentUpdateError) throw new Error(assignmentUpdateError.message);
    }

    const { error: taskProgressError } = await supabase
      .from('tasks')
      .update({ status: 'in_progress' })
      .eq('id', req.params.id);
    if (taskProgressError) throw new Error(taskProgressError.message);

    await addTaskEvent({
      task_id: task.id,
      actor_label: payload.actor_label,
      from_status: 'in_progress',
      to_status: 'in_progress',
      note: `Volunteer ${payload.volunteer_id} marked their assignment complete: ${payload.completion_note}`,
    });

    const updatedTaskResult = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (updatedTaskResult.error) throw new Error(updatedTaskResult.error.message);
    return res.status(200).json({ data: updatedTaskResult.data });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/tasks/:id/complete', async (req, res) => {
  try {
    const payload = completeTaskSchema.parse(req.body);
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (taskError) throw new Error(taskError.message);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!['assigned', 'in_progress'].includes(task.status)) {
      return res.status(400).json({ error: `Task cannot be finalized from status ${task.status}` });
    }

    const assignmentResult = await getTaskAssignments(task.id);
    if (assignmentResult.error && assignmentResult.error.code !== '42P01') throw new Error(assignmentResult.error.message);
    const assignments =
      assignmentResult.error?.code === '42P01'
        ? task.assigned_to
          ? [{ volunteer_id: task.assigned_to, status: ['completed', 'verified'].includes(task.status) ? 'completed' : 'assigned' }]
          : []
        : (assignmentResult.data ?? []);
    if (assignments.length === 0) {
      return res.status(400).json({ error: 'No volunteers are assigned to this task yet' });
    }
    const pendingAssignments = assignments.filter((item) => item.status !== 'completed');
    if (pendingAssignments.length > 0) {
      return res.status(400).json({ error: 'All assigned volunteers must complete before final task completion' });
    }

    const now = new Date().toISOString();
    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'completed',
        completion_note: payload.completion_note,
        completed_at: now,
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (updateError) throw new Error(updateError.message);

    const volunteerIds = [...new Set(assignments.map((item) => item.volunteer_id))];
    if (volunteerIds.length > 0) {
      const volunteerRowsResult = await supabase
        .from('volunteers')
        .select('id, active_tasks')
        .in('id', volunteerIds);
      if (volunteerRowsResult.error) throw new Error(volunteerRowsResult.error.message);
      for (const volunteer of volunteerRowsResult.data ?? []) {
        const { error: volunteerUpdateError } = await supabase
          .from('volunteers')
          .update({ active_tasks: Math.max(0, volunteer.active_tasks - 1) })
          .eq('id', volunteer.id);
        if (volunteerUpdateError) throw new Error(volunteerUpdateError.message);
      }
    }

    await addTaskEvent({
      task_id: updatedTask.id,
      actor_label: payload.actor_label,
      from_status: 'in_progress',
      to_status: 'completed',
      note: payload.completion_note,
    });

    // Update the linked need's status to reflect task completion
    if (updatedTask.report_id) {
      const { error: needUpdateError } = await supabase
        .from('needs_report')
        .update({ status: 'task_completed' })
        .eq('id', updatedTask.report_id)
        .in('status', ['task_created', 'open']); // only update if not already resolved
      if (needUpdateError) {
        // Non-fatal: log but don't fail the task completion
        console.warn('[complete] Failed to update need status:', needUpdateError.message);
      }
    }

    return res.status(200).json({ data: updatedTask });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/tasks/:id/verify', async (req, res) => {
  try {
    const payload = verifyTaskSchema.parse(req.body);

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (taskError) throw new Error(taskError.message);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'completed') {
      return res.status(400).json({ error: `Task must be completed before verify. Current status: ${task.status}` });
    }

    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update({ status: 'verified' })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (updateError) throw new Error(updateError.message);

    const assignmentResult = await getTaskAssignments(task.id);
    if (assignmentResult.error && assignmentResult.error.code !== '42P01') throw new Error(assignmentResult.error.message);
    const volunteerIds = [
      ...new Set(
        (assignmentResult.error?.code === '42P01'
          ? task.assigned_to
            ? [task.assigned_to]
            : []
          : (assignmentResult.data ?? []).map((item) => item.volunteer_id))
      ),
    ];
    if (volunteerIds.length > 0) {
      const volunteerRowsResult = await supabase
        .from('volunteers')
        .select('id, total_deployments')
        .in('id', volunteerIds);
      if (volunteerRowsResult.error) throw new Error(volunteerRowsResult.error.message);
      for (const volunteer of volunteerRowsResult.data ?? []) {
        const { error: volunteerUpdateError } = await supabase
          .from('volunteers')
          .update({ total_deployments: volunteer.total_deployments + 1 })
          .eq('id', volunteer.id);
        if (volunteerUpdateError) throw new Error(volunteerUpdateError.message);
      }
    }

    const { error: needUpdateError } = await supabase
      .from('needs_report')
      .update({ status: 'resolved' })
      .eq('id', task.report_id)
      .select('*')
      .single();
    if (needUpdateError) throw new Error(needUpdateError.message);

    await addTaskEvent({
      task_id: updatedTask.id,
      actor_label: payload.actor_label,
      from_status: 'completed',
      to_status: 'verified',
      note: payload.note,
    });

    return res.status(200).json({ data: updatedTask });
  } catch (error) {
    return handleError(res, error);
  }
});

app.use('/api/v1', router);

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
});
