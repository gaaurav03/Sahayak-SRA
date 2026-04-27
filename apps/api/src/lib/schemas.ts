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

export const needStatusEnum = z.enum(['open', 'task_created', 'resolved']);

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
});

export const createVolunteerSchema = z.object({
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

export const createTaskSchema = z.object({
  report_id: z.string().uuid(),
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
