# Sahayak — Product Requirements Document

**Version:** 1.0 | **Status:** MVP Planning | **Implementation Reference**  
**Stack:** Next.js · Node.js/Express · Supabase (PostgreSQL) · BullMQ · Twilio · Vercel/Railway  
**Last Updated:** April 2026

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [User Personas](#2-user-personas)
3. [User Stories](#3-user-stories)
4. [System Architecture](#4-system-architecture)
5. [Data Models & Schema](#5-data-models--schema)
6. [API Design](#6-api-design)
7. [Matching Algorithm](#7-matching-algorithm)
8. [Core Features — Implementation Spec](#8-core-features--implementation-spec)
9. [Screen Specifications](#9-screen-specifications)
10. [End-to-End Demo Flow](#10-end-to-end-demo-flow)
11. [Technology Stack](#11-technology-stack)
12. [Security & Access Control](#12-security--access-control)
13. [Success Metrics](#13-success-metrics)
14. [Future Scope](#14-future-scope)

---

## 1. Product Overview

Sahayak is a community intelligence platform that digitizes grassroots field data, ranks needs by urgency using a weighted scoring engine, and matches volunteers to tasks using a skill/proximity/availability algorithm. The platform closes the loop from data submission to verified task completion in one unified system.

### Three-Layer Architecture

- **Layer 1 — Data Aggregation Engine**: Simple, mobile-first data collection
- **Layer 2 — Needs Intelligence Engine**: AI-assisted urgency scoring
- **Layer 3 — Smart Volunteer Matcher**: Algorithm-based volunteer matching

### MVP Scope Boundary

| In Scope | Explicitly Out of Scope (v1.1+) |
|----------|--------------------------------|
| Data input form (manual + CSV upload) | Geo heatmap (Mapbox) |
| Needs dashboard with urgency scoring | WhatsApp webhook ingestion |
| Volunteer profile creation | LLM-based classification |
| Task creation from a need | Real-time chat |
| Volunteer matching (rule-based) | Payment / donation flows |
| Task acceptance and completion flow | Multi-NGO data sharing |
| Basic analytics stub | Government API integrations |

---

## 2. User Personas

| Persona | Role | Primary Need | Tech Level |
|---------|------|--------------|------------|
| **Rekha** (NGO Coordinator) | Manages 2–4 field teams, 30–80 reports/week | Single dashboard to prioritize, create tasks, assign volunteers | Moderate |
| **Arjun** (Volunteer) | Student; part-time; medical first aid certified | Receive nearby, skill-matched task notifications; accept from phone | High |
| **Fatima** (Field Worker) | Submits daily situation reports from rural areas | Submit a report from phone in under 2 min on slow networks | Low |

---

## 3. User Stories

### NGO Coordinator (Rekha)

- Upload monthly CSV survey data — system auto-categorizes and prioritizes needs without manual sorting.
- View a single urgency-ranked list of all reported needs to decide which tasks to create first.
- Receive in-app alert when a new critical need (urgency ≥ 8) is submitted.
- Get smart volunteer suggestions for each task; approve with one click.
- Track all open task statuses from one screen.

### Volunteer (Arjun)

- Register skills and available time slots to only receive matched tasks.
- Receive SMS notification when a matched task is created.
- See all assigned tasks with deadlines and location.
- Mark a task complete from phone, automatically notifying the coordinator.

### Field Worker (Fatima)

- Submit a need report from phone in under 2 minutes.
- Form must work on slow/intermittent internet.
- Attach a photo to the report for visual evidence.

---

## 4. System Architecture

### Three-tier architecture: client layer, API layer, and data/services layer.

### Client Layer

- **Next.js 14 (App Router)** — Coordinator web dashboard with SSR for fast initial load.
- **PWA / Mobile** — Volunteer task inbox and field worker submission form.

### API Layer

- **Node.js 20 + Express** — REST API v1 with routes: `/needs`, `/tasks`, `/volunteers`, `/matches`, `/upload`, `/auth`.
- **BullMQ + Redis** — Background jobs: urgency score cron (every 15 min), notification queue, CSV processing worker.

### Data & Services Layer

- **Supabase (PostgreSQL)** — Primary DB with Row-Level Security for org-scoped data isolation.
- **Supabase Storage** — S3-compatible storage for images and CSVs.
- **Upstash Redis** — Queue backend + caching layer.
- **Twilio SMS** — Volunteer notifications (reliable on low-literacy devices without push support).
- **Firebase Cloud Messaging** — Coordinator web push alerts.

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Supabase for DB + Auth + Storage | Single managed service; RLS built-in; real-time subscriptions; free tier sufficient for MVP |
| Next.js App Router | SSR for dashboard initial load; API routes for BFF pattern; React Query for live updates |
| BullMQ for async jobs | Keeps API responses fast; CSV processing and notifications are non-blocking |
| Keyword rules for MVP classification | Zero cost, zero latency, explainable — sufficient for MVP; LLM upgrade deferred to v1.1 |
| Twilio SMS over push | More reliable than app push for low-smartphone-literacy field contexts |

---

## 5. Data Models & Schema

### organizations

```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
name         VARCHAR(200) NOT NULL
type         VARCHAR(50)   -- 'ngo', 'community_group', 'government'
district     VARCHAR(100)
created_at   TIMESTAMPTZ DEFAULT NOW()
```

### users

```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
org_id       UUID REFERENCES organizations(id)
full_name    VARCHAR(200) NOT NULL
phone        VARCHAR(20)
email        VARCHAR(200) UNIQUE
role         VARCHAR(20)  -- 'coordinator','volunteer','field_worker','admin'
created_at   TIMESTAMPTZ DEFAULT NOW()
```

### locations

```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
ward         VARCHAR(100)
district     VARCHAR(100)
state        VARCHAR(100)
lat          DECIMAL(9,6)
lng          DECIMAL(9,6)
population   INTEGER
```

### needs_report

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
org_id          UUID REFERENCES organizations(id)
submitted_by    UUID REFERENCES users(id)
location_id     UUID REFERENCES locations(id)
title           VARCHAR(300) NOT NULL
description     TEXT
category        VARCHAR(50)  -- 'water','health','food','shelter','education','other'
severity_self   VARCHAR(20)  -- 'low','medium','high','critical'
affected_count  INTEGER
source_type     VARCHAR(30)  -- 'manual','csv_upload','whatsapp','api'
urgency_score   DECIMAL(4,2) -- 0.00 to 10.00, computed
status          VARCHAR(30) DEFAULT 'open' -- 'open','task_created','resolved'
image_urls      TEXT[]
raw_text        TEXT         -- original unprocessed text for re-analysis
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

### volunteers

```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id           UUID REFERENCES users(id)
skills            TEXT[]   -- ['medical','driving','cooking']
location_id       UUID REFERENCES locations(id)
availability      JSONB    -- { "Mon": ["09:00-12:00"], "Sat": ["all-day"] }
max_tasks         INTEGER DEFAULT 2
active_tasks      INTEGER DEFAULT 0
is_active         BOOLEAN DEFAULT TRUE
total_deployments INTEGER DEFAULT 0
created_at        TIMESTAMPTZ DEFAULT NOW()
```

### tasks

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
org_id          UUID REFERENCES organizations(id)
report_id       UUID REFERENCES needs_report(id)
created_by      UUID REFERENCES users(id)
title           VARCHAR(300) NOT NULL
description     TEXT
required_skills TEXT[]
estimated_hours DECIMAL(4,1)
deadline        TIMESTAMPTZ
location_id     UUID REFERENCES locations(id)
volunteer_slots INTEGER DEFAULT 1
status          VARCHAR(30) DEFAULT 'open'
                -- 'open','assigned','in_progress','completed','verified','cancelled'
assigned_to     UUID REFERENCES volunteers(id)
completed_at    TIMESTAMPTZ
completion_note TEXT
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### match_log

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
task_id         UUID REFERENCES tasks(id)
volunteer_id    UUID REFERENCES volunteers(id)
skill_score     DECIMAL(4,3)  -- 0 to 1
proximity_score DECIMAL(4,3)  -- 0 to 1
avail_score     DECIMAL(4,3)  -- 0 to 1
workload_score  DECIMAL(4,3)  -- 0 to 1
total_score     DECIMAL(4,3)  -- weighted composite
suggested_at    TIMESTAMPTZ DEFAULT NOW()
accepted        BOOLEAN
response_at     TIMESTAMPTZ
```

### task_events

```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
task_id      UUID REFERENCES tasks(id)
actor_id     UUID REFERENCES users(id)
from_status  VARCHAR(30)
to_status    VARCHAR(30)
note         TEXT
created_at   TIMESTAMPTZ DEFAULT NOW()
```

---

## 6. API Design

**Base URL:** `/api/v1`  
**Authentication:** Bearer token (Supabase JWT)  
**Content-Type:** `application/json`

### Needs Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/needs` | List needs. Query params: `status`, `category`, `location_id`, `min_urgency`, `sort` (urgency\|newest\|most_reported), `limit`, `offset` |
| POST | `/needs` | Submit new need (manual). Body: `{ title, description, category, severity_self, affected_count, location_id, image_urls }`. Returns need with computed `urgency_score`. |
| POST | `/needs/bulk-upload` | CSV/Excel upload. `multipart/form-data`: `file` + `column_mapping` JSON. Returns `{ job_id, accepted_count, rejected_rows }`. Processing is async. |
| GET | `/needs/:id` | Full detail for a single need. |
| PATCH | `/needs/:id` | Update need status or fields. Coordinator only. |

### Volunteers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/volunteers` | List volunteers. Query params: `skills` (CSV), `available` (bool), `location_id`, `is_active`. |
| POST | `/volunteers` | Register volunteer. Body: `{ user_id, skills, location_id, availability, max_tasks }` |
| GET | `/volunteers/:id` | Volunteer profile + task history. |
| PUT | `/volunteers/:id/availability` | Update availability JSONB. Triggers re-evaluation of pending matches. |
| PATCH | `/volunteers/:id` | Update skills, max_tasks, active status. |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tasks` | Create task from need. Body: `{ report_id, title, description, required_skills, estimated_hours, deadline, volunteer_slots, location_id }`. Triggers matching engine; returns task + top-3 suggestions. |
| GET | `/tasks` | List tasks. Query params: `status`, `org_id`, `assigned_to`, `location_id`, `sort` |
| GET | `/tasks/:id` | Task detail with current assignment and full event log. |
| GET | `/tasks/:id/matches` | Re-run matching engine on demand. Returns ranked volunteer array with score breakdowns. |
| POST | `/tasks/:id/assign` | Coordinator assigns volunteer. Body: `{ volunteer_id }`. Status → assigned; sends SMS. |
| POST | `/tasks/:id/accept` | Volunteer accepts task. Status → in_progress; notifies coordinator. |
| POST | `/tasks/:id/complete` | Volunteer marks complete. Body: `{ completion_note, image_url? }`. Updates `volunteer.active_tasks`; notifies coordinator. |
| POST | `/tasks/:id/verify` | Coordinator verifies. Status → verified; increments `volunteer.total_deployments`. |

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/signup` | Register organization + admin user. |
| POST | `/auth/login` | Email/password login; returns JWT. |
| POST | `/auth/invite` | Coordinator invites volunteer by phone/email. |
| POST | `/auth/otp` | Phone OTP for low-connectivity field workers. |

---

## 7. Matching Algorithm

The matching engine runs when a task is created and can be triggered manually by a coordinator.

### Eligibility Filter (applied before scoring)

A volunteer is eligible for a task if:

1. `volunteer.is_active = TRUE`
2. `volunteer.active_tasks < volunteer.max_tasks`
3. Volunteer's location is within 50 km of task location (hard cutoff; haversine distance)
4. Volunteer's availability overlaps with task deadline window

### Scoring Formula

```
total_score = (skill_score × 0.45)
            + (proximity_score × 0.30)
            + (avail_score × 0.15)
            + (workload_score × 0.10)
```

#### skill_score (weight: 45%)

Jaccard similarity between volunteer skills and task required_skills:

```
skill_score = |volunteer.skills ∩ task.required_skills|
            / |volunteer.skills ∪ task.required_skills|
```

Example: `volunteer=['medical','driving']`, `task=['medical']` → score = 1/2 = 0.50

#### proximity_score (weight: 30%)

Inverse linear score over 50 km range:

```
distance_km = haversine(volunteer.lat, volunteer.lng, task.lat, task.lng)
proximity_score = max(0, 1 - (distance_km / 50))
```

- 0 km → 1.0
- 25 km → 0.5
- 50 km → 0.0

#### avail_score (weight: 15%)

```
1.0  — task deadline day/time falls within a volunteer availability slot
0.5  — volunteer has no explicit slot but is_active = TRUE
0.0  — volunteer explicitly marked unavailable on that day
```

#### workload_score (weight: 10%)

```
1.0  — active_tasks = 0
0.7  — active_tasks = 1
0.3  — active_tasks = max_tasks - 1
0.0  — active_tasks >= max_tasks  (blocked by eligibility filter)
```

**Output:** Top 3 eligible volunteers ranked by `total_score` descending. All scores logged to `match_log`.

### Urgency Scoring (Needs Dashboard)

Computed on ingestion; refreshed every 15 minutes via cron job:

```
urgency_score = (severity_weight    × 3.0)
              + (frequency_bonus     × 2.0)
              + (recency_decay)
              + (keyword_boost       × 1.5)
              + (affected_count_factor × 0.5)
```

| Component | Definition |
|-----------|------------|
| **severity_weight** | `critical=3`, `high=2`, `medium=1`, `low=0` |
| **frequency_bonus** | Count of same location+category reports in last 7 days, capped at 3 |
| **recency_decay** | 1.0 at submission; decays 0.05/hour to floor of 0.0 |
| **keyword_boost** | +1.5 if description contains: `urgent`, `emergency`, `critical`, `dying`, `flood`, `no water`, `hospitalised`, `collapsed` |
| **affected_count_factor** | `min(affected_count / 100, 1.0)` — capped at 1.0 for 100+ affected |
| **Final normalization** | Normalized to 0–10 scale. ≥7 = High (red). 4–6 = Medium (amber). <4 = Low (green). |

---

## 8. Core Features — Implementation Spec

### Feature 1 — Data Input Form (Priority: Critical)

Mobile-first, no login required for field submission (public URL `/submit/:org_slug`). Coordinators review submitted reports.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Issue title | text input | Yes | — |
| Category | dropdown | Yes | Water / Health / Food / Shelter / Education / Other |
| Description | textarea | No | Free text |
| Location | text + GPS auto-detect | Yes | Ward/area name; optional GPS |
| Severity | segmented buttons | Yes | Low / Medium / High / Critical |
| Affected count | number input | No | Population estimate |
| Attachments | file picker | No | Image, PDF |
| Reporter name + phone | text inputs | No | Anonymous submission allowed |

#### CSV Bulk Upload

- Drag-and-drop CSV/Excel with column mapping UI.
- Parse client-side with Papa Parse; server-side with Node.js stream for large files.
- Preview before import; partial import accepted with per-row error report.
- Async processing via BullMQ worker; poll status via `GET /jobs/:job_id`.
- Store with `source_type: 'csv_upload'` in needs_report table.

### Feature 2 — Needs Dashboard (Priority: Critical)

Main coordinator screen. Server-side rendered (Next.js); live updates via React Query. Fetches from `GET /api/v1/needs?status=open&sort=urgency`.

| Element | Spec |
|---------|------|
| **Per-card data** | Title, category badge, urgency score bar (red ≥7 / amber 4–6 / green <4), location, report count, status badge, Create Task button |
| **Filters** | Category (multi-select), Priority (High/Medium/Low), Location (text search), Date range |
| **Sorting** | Default: urgency score desc. Secondary: newest, most-reported, location |
| **Urgency update** | Computed server-side on ingestion; cron refresh every 15 minutes |

### Feature 3 — Volunteer Registry (Priority: Critical)

Profile creation by volunteer or bulk pre-registration by coordinator.

| Field | Type | Notes |
|-------|------|-------|
| Full name, phone, email | text inputs | Required |
| Skills | multi-select chips | Taxonomy: medical, logistics, teaching, counseling, driving, physical_labor, language_support, digital_literacy, cooking |
| Location | text: ward/area | Used for proximity scoring |
| Availability | day + time slot picker | Stored as JSONB: `{ "Mon": ["09:00-12:00"], "Sat": ["all-day"] }` |
| Max simultaneous tasks | number stepper | Default: 2 |
| Active status | toggle | Inactive volunteers excluded from matching |

### Feature 4 — Task Management (Priority: Critical)

#### Task Creation Fields

| Field | Notes |
|-------|-------|
| Linked need | Auto-populated from dashboard; read-only |
| Task title & description | Pre-filled from need title; editable |
| Required skills | Multi-select from same taxonomy as volunteer profiles |
| Estimated duration (hours) | Number input |
| Deadline | Date-time picker |
| Location | Inherited from need; editable |
| Volunteer slots needed | Number stepper; default 1 |

#### Task Lifecycle

**Open → Assigned → In Progress → Completed → Verified**

Each state transition is logged to `task_events` table (actor, timestamp, note) for full audit trail. State transitions trigger webhook events consumed by the notification service.

### Feature 5 — Match Suggestion UI (Priority: Critical)

- Three volunteer cards ranked by `total_score` descending.
- Each card: name, initials avatar, fit score bar (0–100%), skill overlap chips (matched/unmatched), distance badge, availability summary, current active task count, Assign button.
- 'Assign manually' text link opens full volunteer search (coordinator override).
- On coordinator clicking Assign: status → assigned; SMS sent to volunteer; match logged.

### Feature 6 — Notifications (Priority: High)

| Trigger | Channel | Recipient | Template |
|---------|---------|-----------|----------|
| Task matched | Twilio SMS | Volunteer | Hi [name], new task: [title] in [location] by [deadline]. Reply YES to accept. |
| Task deadline -24h | Twilio SMS | Volunteer | Reminder: [title] is due tomorrow at [time]. |
| Assignment confirmed | Twilio SMS | Volunteer | You are confirmed for: [title]. Location: [location]. |
| Critical need submitted (urgency ≥ 8) | In-app + email | Coordinator | New critical need: [title] in [location]. Urgency: [score]. |
| Volunteer accepted / declined | In-app | Coordinator | Live status update on task card. |
| Task marked complete | In-app + email | Coordinator | [name] marked [title] complete. Click to verify. |

**Implementation:** Use BullMQ queue for notification batching. Twilio SMS for volunteers (more reliable than push on low-literacy devices). Firebase Cloud Messaging for coordinator web push. Retry queue: 3 attempts on failure.

### Feature 7 — Analytics Stub (Priority: Medium)

- Summary tiles: Total needs submitted (this week / all time), Tasks completed, Volunteers active.
- Bar chart: Needs by category (this month).
- Donut chart: Task status distribution (open / in progress / completed / verified).
- Table: Top 5 most active volunteers with deployment count.
- **Implementation:** Postgres aggregate queries, cached 10 minutes. Recharts for client-side rendering. No dedicated analytics DB needed for MVP.

---

## 9. Screen Specifications

### Screen 1 — Coordinator Dashboard

- Full-width list of need cards sorted by urgency score.
- Top bar: org name, notification bell, user avatar.
- Collapsible sidebar: filter panel (category checkboxes, priority toggle, date range, location search).
- Each card: category color badge, title, urgency score bar (red/amber/green), location, submit date, affected count, status badge, 'Create Task' CTA.
- Sticky bottom: '+ Submit Need' button for quick field input.

### Screen 2 — Submit Need Form

- Single-column, mobile-first. Large tap targets.
- Field order: Title → Category (segmented buttons) → Description → Location (text + 'Use my location') → Severity (4 large buttons) → Affected count → Photo → Submit.
- Progress bar at top showing form completion percentage.
- Must function on 2G/slow connections; form state preserved on reconnect.

### Screen 3 — Task Creation

- Split card: top half = linked need (read-only); bottom half = task form.
- Task title pre-filled from need title (editable).
- 'Find Volunteers' button triggers matching engine with loading spinner.

### Screen 4 — Match Suggestions

- Three volunteer cards stacked vertically.
- Each card: name, match score bar, skill chips (matched ✓ / unmatched ✗), distance badge, availability summary, active task count, Assign button.
- 'Assign manually' link below cards for coordinator override.

### Screen 5 — Volunteer Task Inbox

- Tabs: 'My Tasks' | 'Recommended'.
- Task card: title, org name, location with map thumbnail, deadline countdown, required skills.
- Actions: Accept / Decline (pending tasks); Mark Complete (in-progress tasks).

### Screen 6 — Analytics Stub

- Three summary metric tiles at top.
- Bar chart (needs by category) + Donut chart (task status) side by side.
- Table: top 5 volunteers with name, skills, and deployment count.

---

## 10. End-to-End Demo Flow

This is the complete MVP flow. Every step must work end-to-end.

| Step | Actor | Action | System Response |
|------|-------|--------|-----------------|
| 1 | Field Worker | Opens `/submit/:org_slug` on phone. Fills form: 'Ward 7 — no clean water, 200 households, Critical.' | Report stored in needs_report. Urgency score computed: 8.7 (High). |
| 2 | System | Urgency scoring runs on ingestion. | Card appears on coordinator dashboard with red badge, score 8.7. |
| 3 | Coordinator | Clicks 'Create Task' on the new card. | Task form opens pre-filled with need data. |
| 4 | Coordinator | Fills task: 'Emergency water distribution — Ward 7'. Skills: logistics, driving. Deadline: tomorrow 10am. Clicks 'Find Volunteers'. | Matching engine runs. Returns top 3: #1 Arjun 94% / 2.3km, #2 Priya 81% / 4.1km, #3 Rohit 72% / 6.8km. |
| 5 | Coordinator | Clicks 'Assign' on Arjun. | Task status → assigned. SMS sent to Arjun. match_log entry created. |
| 6 | Arjun (Volunteer) | Receives SMS, logs in, sees task in inbox, clicks 'Accept'. | Task status → in_progress. Coordinator notified in-app. |
| 7 | Arjun (Volunteer) | Completes task. Clicks 'Mark Complete', uploads photo. | Task status → completed. volunteer.active_tasks decremented. Coordinator notified. |
| 8 | Coordinator | Reviews completion. Clicks 'Verify'. | Task status → verified. volunteer.total_deployments incremented. Need status → resolved. |

---

## 11. Technology Stack

### Frontend

| Package | Version | Purpose |
|---------|---------|---------|
| next | 14.x (App Router) | Web framework; SSR for dashboard; API routes for BFF |
| react | 18.x | UI component library |
| tailwindcss | 3.x | Utility-first styling |
| @tanstack/react-query | 5.x | Server state, caching, background refetch |
| recharts | 2.x | Analytics charts (bar, donut) |
| react-hook-form | 7.x | Form state management + validation |
| papaparse | 5.x | Client-side CSV parsing for bulk upload preview |
| zod | 3.x | Schema validation (shared with backend) |

### Backend

| Package | Version | Purpose |
|---------|---------|---------|
| node | 20 LTS | Runtime |
| express | 4.x | HTTP framework |
| bullmq | 5.x | Job queue for async CSV processing + notifications |
| ioredis | 5.x | Redis client for BullMQ |
| papaparse | 5.x | Server-side CSV parsing |
| pdf-parse | 1.x | PDF text extraction from field reports |
| helmet | 7.x | HTTP security headers |
| zod | 3.x | Runtime API input validation |
| nodemailer | 6.x | Transactional email via SendGrid |
| twilio | 5.x | SMS volunteer notifications |
| firebase-admin | 12.x | FCM web push for coordinator alerts |

### Database & Infrastructure

| Service | Plan | Purpose |
|---------|------|---------|
| Supabase | Free → Pro | PostgreSQL + Auth + Storage + RLS + Realtime |
| Upstash Redis | Free → Pay-per-use | BullMQ backend + response caching |
| Vercel | Hobby → Pro | Frontend hosting (Next.js) |
| Railway | Free credit → Paid | Backend Node.js process |
| Twilio | Trial → Pay-per-use | SMS notifications |
| Firebase | Spark (free) | FCM coordinator web push |
| SendGrid | Free tier | Email digests and invite links |

---

## 12. Security & Access Control

### Role Matrix

| Role | Permissions |
|------|-------------|
| **coordinator** | Full access to own org data; create/assign tasks; view all volunteers; access analytics |
| **volunteer** | View and respond to own assigned tasks; update own profile; view org open tasks |
| **field_worker** | Submit needs via public form (no account required); optional account for status tracking |
| **admin** | Cross-org visibility; user management; system configuration |

### Implementation Requirements

- **Row-Level Security (RLS)** in Supabase: coordinators from Org A cannot query data from Org B.
- All API endpoints validate `org_id` extracted from Supabase JWT before returning any data.
- Public submission URL (`/submit/:org_slug`) requires no auth. MVP: auto-approved. v1.1: coordinator approval queue.
- Helmet.js for HTTP security headers on all Express routes.
- Zod runtime validation on every API input; reject with 400 + field-level error messages.
- Supabase Auth handles JWT lifecycle: issue, refresh, revoke.
- OTP (phone) auth via Supabase for field workers who cannot manage passwords.

---

## 13. Success Metrics

| Metric | MVP Target | 3-Month Target |
|--------|------------|----------------|
| Time: need submission → task creation | < 2 hours | < 45 minutes |
| Time: task matched → volunteer accepted | < 24 hours | < 4 hours |
| CSV ingestion time (100 rows) | < 5 minutes | < 1 minute |
| Volunteer-task fit score average | ≥ 65% | ≥ 80% |
| Task completion rate | ≥ 60% | ≥ 80% |
| Critical needs (urgency ≥ 8) resolved within 48h | ≥ 70% | ≥ 90% |
| Coordinator time saved per week (self-reported) | 2+ hours | 5+ hours |
| Volunteer acceptance rate (when matched) | ≥ 50% | ≥ 70% |

---

## 14. Future Scope (v1.1+)

| Feature | Version | Notes |
|---------|---------|-------|
| Geo heatmap (ward-level overlays) | v1.1 | Mapbox GL JS; urgency overlay by ward |
| WhatsApp submission webhook | v1.1 | Twilio WhatsApp Business API |
| LLM-based report classification | v1.1 | Claude/OpenAI API replaces keyword rules |
| Offline mode for field submission | v1.1 | Service worker + sync queue |
| Coordinator approval queue for submissions | v1.1 | Currently auto-approved in MVP |
| Predictive crisis alerts | v2.0 | ML model on historical urgency patterns |
| Voice-to-text report (regional languages) | v2.0 | Hindi, Marathi, Telugu, Bengali |
| Multi-district / multi-NGO org hierarchy | v2.0 | Cross-org aggregate dashboard for District Admin |
| Government data portal integration | v2.0 | Cross-verification with official ward data |
| Volunteer impact badge system | v2.0 | Public profile: hours, tasks, communities |

---

*Document version 1.0 — Sahayak Labs — April 2026*  
*For implementation questions, refer to Section 6 (API Design) and Section 5 (Data Models) first.*
