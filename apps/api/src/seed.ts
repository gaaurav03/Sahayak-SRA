import { supabase } from './lib/supabase.js';
import { computeUrgencyScore } from './lib/urgency.js';


async function seedNeeds() {
  const rows = [
    {
      title: 'Ward 7 - no clean water',
      description: 'Urgent requirement for tanker supply. 200 households impacted.',
      category: 'water',
      severity_self: 'critical',
      affected_count: 200,
      location_text: 'Ward 7',
      lat: null,
      lng: null,
      status: 'open',
    },
    {
      title: 'Temporary clinic support',
      description: 'Health camp needs support staff by tomorrow morning.',
      category: 'health',
      severity_self: 'high',
      affected_count: 90,
      location_text: 'Central Zone',
      lat: null,
      lng: null,
      status: 'open',
    },
  ] as const;

  for (const row of rows) {
    const urgency_score = computeUrgencyScore({
      severity: row.severity_self,
      affectedCount: row.affected_count,
      title: row.title,
      description: row.description,
    });

    const { error } = await supabase.from('needs_report').insert({
      ...row,
      urgency_score,
    });

    if (error && !error.message.toLowerCase().includes('duplicate')) {
      throw new Error(`Need seed failed: ${error.message}`);
    }
  }
}

async function seedVolunteers() {
  const rows = [
    {
      full_name: 'Arjun Singh',
      phone: '+911234560001',
      email: 'arjun@example.com',
      skills: ['logistics', 'driving'],
      location_text: 'Ward 7',
      lat: null,
      lng: null,
      availability: { Mon: ['09:00-18:00'], Tue: ['09:00-18:00'], Sat: ['all-day'] },
      max_tasks: 2,
      active_tasks: 0,
      approval_status: 'approved',
      is_active: true,
      total_deployments: 3,
    },
    {
      full_name: 'Priya Nair',
      phone: '+911234560002',
      email: 'priya@example.com',
      skills: ['medical', 'counseling'],
      location_text: 'Central Zone',
      lat: null,
      lng: null,
      availability: { Mon: ['10:00-17:00'], Wed: ['10:00-17:00'] },
      max_tasks: 2,
      active_tasks: 0,
      approval_status: 'approved',
      is_active: true,
      total_deployments: 2,
    },
    {
      full_name: 'Rohit Kumar',
      phone: '+911234560003',
      email: 'rohit@example.com',
      skills: ['driving', 'physical_labor'],
      location_text: 'Riverside',
      lat: null,
      lng: null,
      availability: { Tue: ['all-day'], Thu: ['09:00-18:00'] },
      max_tasks: 2,
      active_tasks: 0,
      approval_status: 'approved',
      is_active: true,
      total_deployments: 5,
    },
  ];

  for (const row of rows) {
    const { error } = await supabase.from('volunteers').insert(row);
    if (error && !error.message.toLowerCase().includes('duplicate')) {
      throw new Error(`Volunteer seed failed: ${error.message}`);
    }
  }
}

async function run() {
  await seedNeeds();
  await seedVolunteers();
  // eslint-disable-next-line no-console
  console.log('[seed] done');
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed', error);
  process.exitCode = 1;
});
