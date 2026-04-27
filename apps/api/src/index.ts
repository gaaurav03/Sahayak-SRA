import cors from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
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

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: error.flatten() });
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

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'api', time: new Date().toISOString() });
});

const router = express.Router();

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

router.post('/volunteers', async (req, res) => {
  try {
    const payload = createVolunteerSchema.parse(req.body);

    const { data, error } = await supabase
      .from('volunteers')
      .insert({
        ...payload,
        active_tasks: 0,
        total_deployments: 0,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    return res.status(201).json({ data });
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
