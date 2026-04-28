import { z } from 'zod';

export const categoryEnum = z.enum([
  'water',
  'health',
  'food',
  'shelter',
  'education',
  'other',
]);

export const severityEnum = z.enum(['low', 'medium', 'high', 'critical']);

export const taskStatusEnum = z.enum([
  'open',
  'assigned',
  'in_progress',
  'completed',
  'verified',
]);

export const needStatusEnum = z.enum(['pending', 'open', 'rejected', 'task_created', 'resolved']);
export const volunteerApprovalStatusEnum = z.enum(['pending', 'approved', 'rejected']);

const nullableNumber = z.number().nullable().optional();

export const createNeedSchema = z.object({
  title: z.string().min(3).max(300),
  description: z.string().max(4000).optional().default(''),
  category: categoryEnum,
  severity_self: severityEnum,
  affected_count: z.number().int().min(0).optional().default(0),
  location_text: z.string().min(2).max(240),
  lat: nullableNumber,
  lng: nullableNumber,
  image_urls: z.array(z.string().url()).min(1, 'At least one evidence image is required'),
  client_captured_at: z.string().datetime(),
  reporter_clerk_id: z.string().optional(),
});

export const approveNeedSchema = z.object({
  actor_label: z.string().min(2).max(120).optional().default('Coordinator'),
});

export const rejectNeedSchema = z.object({
  rejection_note: z.string().max(1000).optional().default(''),
  actor_label: z.string().min(2).max(120).optional().default('Coordinator'),
});

export const needPriorityOverrideSchema = z.object({
  urgency_score: z.number().min(0).max(10),
  note: z.string().max(500).optional().default('Manual coordinator override'),
  actor_label: z.string().min(2).max(120).optional().default('Coordinator'),
});

export const needTimelineEntrySchema = z.object({
  type: z.enum(['created', 'approved', 'task_created', 'assigned', 'completed', 'verified']),
  title: z.string(),
  timestamp: z.string().nullable(),
  actor_label: z.string().nullable(),
  note: z.string().nullable(),
  task_id: z.string().uuid().nullable(),
  task_title: z.string().nullable(),
});

export const createVolunteerSchema = z.object({
  clerk_id: z.string().optional(),
  full_name: z.string().min(2).max(200),
  phone: z.string().min(6).max(30).optional().default(''),
  email: z.string().email().optional().nullable(),
  skills: z.array(z.string().min(1)).default([]),
  location_text: z.string().min(2).max(240),
  lat: nullableNumber,
  lng: nullableNumber,
  availability: z.record(z.array(z.string())).optional().default({}),
  max_tasks: z.number().int().min(1).max(10).optional().default(2),
  is_active: z.boolean().optional().default(true),
});

export const rejectVolunteerSchema = z.object({
  rejection_note: z.string().max(1000).optional().default(''),
});

export const createTaskSchema = z.object({
  report_id: z.string().uuid(),
  reporter_clerk_id: z.string().optional(),
  title: z.string().min(3).max(300),
  description: z.string().max(4000).optional().default(''),
  required_skills: z.array(z.string().min(1)).default([]),
  estimated_hours: z.number().min(0).max(999).optional().nullable(),
  deadline: z.string().datetime(),
  location_text: z.string().min(2).max(240),
  lat: nullableNumber,
  lng: nullableNumber,
  volunteer_slots: z.number().int().min(1).max(10).optional().default(1),
});

export const assignTaskSchema = z.object({
  volunteer_id: z.string().uuid(),
  actor_label: z.string().min(2).max(120).optional().default('Coordinator'),
});

export const completeTaskSchema = z.object({
  completion_note: z.string().min(2).max(2000),
  actor_label: z.string().min(2).max(120).optional().default('Volunteer'),
});

export const verifyTaskSchema = z.object({
  actor_label: z.string().min(2).max(120).optional().default('Coordinator'),
  note: z.string().max(400).optional().default('Task verified'),
});

export const rejectTaskSchema = z.object({
  rejection_note: z.string().max(1000).optional().default(''),
});

export const completeTaskByVolunteerSchema = z.object({
  volunteer_id: z.string().uuid(),
  completion_note: z.string().min(2).max(2000),
  actor_label: z.string().min(2).max(120).optional().default('Volunteer'),
});

export const createVolunteerRequestSchema = z
  .object({
    volunteer_id: z.string().uuid(),
    need_id: z.string().uuid().optional(),
    task_id: z.string().uuid().optional(),
    note: z.string().max(500).optional().default(''),
  })
  .refine((value) => Boolean(value.need_id || value.task_id), {
    message: 'Either need_id or task_id is required',
    path: ['need_id'],
  });

export const rejectVolunteerRequestSchema = z.object({
  coordinator_note: z.string().max(1000).optional().default(''),
});
