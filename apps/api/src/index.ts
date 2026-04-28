import cors from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { verifyToken } from '@clerk/backend';
import { clerkMiddleware } from '@clerk/express';
import { rankMatches } from './lib/matching.js';
import {
  assignTaskSchema,
  completeTaskSchema,
  createNeedSchema,
  createTaskSchema,
  createVolunteerSchema,
  verifyTaskSchema,
} from './lib/schemas.js';
import { supabase } from './lib/supabase.js';
import { computeUrgencyScore } from './lib/urgency.js';

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

function dayKey(dateValue: string) {
  return new Date(dateValue).toISOString().slice(0, 10);
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'api', time: new Date().toISOString() });
});

import { clerkClient } from '@clerk/express';
import { AuthenticatedRequest } from './lib/auth.js';

const router = express.Router();

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

router.get('/needs', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    let query = supabase
      .from('needs_report')
      .select('*')
      .order('urgency_score', { ascending: false })
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return res.status(200).json({ data: data ?? [] });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/needs', async (req, res) => {
  try {
    const payload = createNeedSchema.parse(req.body);
    const urgency = computeUrgencyScore({
      severity: payload.severity_self,
      affectedCount: payload.affected_count,
      title: payload.title,
      description: payload.description,
    });

    const insertBody = {
      ...payload,
      urgency_score: urgency,
      status: 'open',
    };

    const { data, error } = await supabase
      .from('needs_report')
      .insert(insertBody)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    return res.status(201).json({ data });
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

    return res.status(200).json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/volunteers', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('volunteers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return res.status(200).json({ data: data ?? [] });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/analytics/overview', async (_req, res) => {
  try {
    const [needsResult, tasksResult, volunteersResult, eventsResult] = await Promise.all([
      supabase
        .from('needs_report')
        .select('id, category, status, urgency_score, created_at'),
      supabase
        .from('tasks')
        .select('id, title, status, required_skills, created_at, completed_at, deadline, assigned_to'),
      supabase
        .from('volunteers')
        .select('id, full_name, is_active, active_tasks, max_tasks, total_deployments, skills, created_at'),
      supabase
        .from('task_events')
        .select('id, actor_label, to_status, created_at, note')
        .order('created_at', { ascending: false }),
    ]);

    if (needsResult.error) throw needsResult.error;
    if (tasksResult.error) throw tasksResult.error;
    if (volunteersResult.error) throw volunteersResult.error;
    if (eventsResult.error) throw eventsResult.error;

    const needs = needsResult.data ?? [];
    const tasks = tasksResult.data ?? [];
    const volunteers = volunteersResult.data ?? [];
    const taskEvents = eventsResult.data ?? [];
    const now = new Date();

    const taskStatusOrder = ['open', 'assigned', 'in_progress', 'completed', 'verified'];
    const needStatusOrder = ['open', 'task_created', 'resolved'];
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
    const activeVolunteers = volunteers.filter((volunteer) => volunteer.is_active).length;
    const inactiveVolunteers = volunteers.length - activeVolunteers;
    const availableVolunteers = volunteers.filter(
      (volunteer) => volunteer.is_active && volunteer.active_tasks < volunteer.max_tasks
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
      if (!volunteer.is_active) continue;
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
    const normalizedEmail = payload.email?.trim().toLowerCase() || null;

    if (normalizedEmail) {
      const { data: existingVolunteer, error: existingVolunteerError } = await supabase
        .from('volunteers')
        .select('id, full_name, email')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existingVolunteerError) throw existingVolunteerError;
      if (existingVolunteer) {
        return res.status(409).json({
          error: `A volunteer with email ${normalizedEmail} already exists.`,
        });
      }
    }

    const { data, error } = await supabase
      .from('volunteers')
      .insert({
        ...payload,
        email: normalizedEmail,
        active_tasks: 0,
        total_deployments: 0,
      })
      .select('*')
      .single();

    if (error) throw error;
    return res.status(201).json({ data });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    let query = supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return res.status(200).json({ data: data ?? [] });
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

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        ...payload,
        status: 'open',
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    const { error: needUpdateError } = await supabase
      .from('needs_report')
      .update({ status: 'task_created' })
      .eq('id', payload.report_id);
    if (needUpdateError) throw new Error(needUpdateError.message);

    await addTaskEvent({
      task_id: data.id,
      actor_label: 'Coordinator',
      from_status: null,
      to_status: 'open',
      note: `Task created from need: ${payload.report_id}`,
    });

    const { data: volunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select('*')
      .eq('is_active', true);
    if (volunteersError) throw new Error(volunteersError.message);

    const matches = rankMatches(data, volunteers ?? []);

    return res.status(201).json({ data, matches });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/tasks', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.status(200).json({ data: data ?? [] });
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

    const [eventResult, volunteerResult, needResult] = await Promise.all([
      supabase
        .from('task_events')
        .select('*')
        .eq('task_id', task.id)
        .order('created_at', { ascending: true }),
      task.assigned_to
        ? supabase.from('volunteers').select('*').eq('id', task.assigned_to).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from('needs_report').select('*').eq('id', task.report_id).maybeSingle(),
    ]);

    if (eventResult.error) throw new Error(eventResult.error.message);
    if (volunteerResult.error) throw new Error(volunteerResult.error.message);
    if (needResult.error) throw new Error(needResult.error.message);

    return res.status(200).json({
      data: {
        ...task,
        assigned_volunteer: volunteerResult.data,
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
    if (task.status !== 'open') {
      return res.status(400).json({ error: `Task must be open to assign. Current status: ${task.status}` });
    }

    const { data: volunteer, error: volunteerError } = await supabase
      .from('volunteers')
      .select('*')
      .eq('id', payload.volunteer_id)
      .maybeSingle();
    if (volunteerError) throw new Error(volunteerError.message);
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found' });
    if (!volunteer.is_active || volunteer.active_tasks >= volunteer.max_tasks) {
      return res.status(400).json({ error: 'Volunteer is not eligible for assignment' });
    }

    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'assigned',
        assigned_to: payload.volunteer_id,
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (updateError) throw new Error(updateError.message);

    const { error: volunteerUpdateError } = await supabase
      .from('volunteers')
      .update({ active_tasks: volunteer.active_tasks + 1 })
      .eq('id', payload.volunteer_id);
    if (volunteerUpdateError) throw new Error(volunteerUpdateError.message);

    await addTaskEvent({
      task_id: updatedTask.id,
      actor_label: payload.actor_label,
      from_status: 'open',
      to_status: 'assigned',
      note: `Volunteer assigned: ${payload.volunteer_id}`,
    });

    return res.status(200).json({ data: updatedTask });
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
    if (!task.assigned_to) return res.status(400).json({ error: 'Task must be assigned before completion' });
    if (!['assigned', 'in_progress'].includes(task.status)) {
      return res.status(400).json({ error: `Task cannot be completed from status ${task.status}` });
    }

    if (task.status === 'assigned') {
      await addTaskEvent({
        task_id: task.id,
        actor_label: payload.actor_label,
        from_status: 'assigned',
        to_status: 'in_progress',
        note: 'Task moved to in_progress implicitly before completion',
      });
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

    const { data: volunteer, error: volunteerError } = await supabase
      .from('volunteers')
      .select('*')
      .eq('id', task.assigned_to)
      .maybeSingle();
    if (volunteerError) throw new Error(volunteerError.message);
    if (volunteer) {
      const nextActiveTasks = Math.max(0, volunteer.active_tasks - 1);
      const { error: volunteerUpdateError } = await supabase
        .from('volunteers')
        .update({ active_tasks: nextActiveTasks })
        .eq('id', volunteer.id);
      if (volunteerUpdateError) throw new Error(volunteerUpdateError.message);
    }

    await addTaskEvent({
      task_id: updatedTask.id,
      actor_label: payload.actor_label,
      from_status: task.status === 'assigned' ? 'in_progress' : 'in_progress',
      to_status: 'completed',
      note: payload.completion_note,
    });

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

    if (task.assigned_to) {
      const { data: volunteer, error: volunteerError } = await supabase
        .from('volunteers')
        .select('*')
        .eq('id', task.assigned_to)
        .maybeSingle();
      if (volunteerError) throw new Error(volunteerError.message);

      if (volunteer) {
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
      .eq('id', task.report_id);
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
