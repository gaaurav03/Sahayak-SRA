# Hackathon MVP Implementation Plan for Sahayak

## Summary

Build a single end-to-end demo flow and ignore production-only features for now. The MVP will let a coordinator submit or view needs, create tasks from needs, register volunteers, run matching, assign a volunteer, and move the task through completion and verification. The system will use the existing monorepo structure, keep the Express API, keep the Next.js web app, reuse `packages/core` scoring utilities, use Supabase as the only persistence layer, and defer Redis/BullMQ, Twilio, Firebase, CSV upload, and advanced auth.

Success means this demo works reliably from one browser session:
1. Create a need from the submit form.
2. See the need appear on the dashboard with urgency ranking.
3. Create a task from that need.
4. See top 3 volunteer matches.
5. Assign one volunteer.
6. Mark the task complete.
7. Verify the task and resolve the linked need.

## Implementation Changes

### Product and routing
- Replace the current `/` landing page behavior with a redirect to `/coordinator/needs` so the app opens directly to the working dashboard.
- Keep `/submit` as the MVP public submission page; do not implement `/submit/:org_slug` yet.
- Treat the app as a single-org demo. Remove org-level branching from implementation decisions and hardcode a single demo organization in seeded data.

### Data model and persistence
- Use Supabase Postgres as the only database for the MVP.
- Create four tables only: `needs_report`, `volunteers`, `tasks`, `task_events`.
- Skip `organizations`, `users`, `locations`, and `match_log` as separate tables for now; inline only the fields needed for the demo.
- Store these minimum fields:
  - `needs_report`: `id`, `title`, `description`, `category`, `severity_self`, `affected_count`, `location_text`, `lat`, `lng`, `urgency_score`, `status`, `created_at`
  - `volunteers`: `id`, `full_name`, `phone`, `email`, `skills`, `location_text`, `lat`, `lng`, `availability`, `max_tasks`, `active_tasks`, `is_active`, `total_deployments`, `created_at`
  - `tasks`: `id`, `report_id`, `title`, `description`, `required_skills`, `estimated_hours`, `deadline`, `location_text`, `lat`, `lng`, `volunteer_slots`, `status`, `assigned_to`, `completion_note`, `created_at`, `completed_at`
  - `task_events`: `id`, `task_id`, `actor_label`, `from_status`, `to_status`, `note`, `created_at`
- Represent `skills` as text arrays and `availability` as JSON.
- Use nullable `lat` and `lng`. If coordinates are missing, matching will fall back to simple location text equality boost and a neutral proximity score.

### Backend API
- Keep Express and add JSON REST endpoints under `/api/v1`.
- Implement these endpoints only:
  - `GET /needs`
  - `POST /needs`
  - `GET /needs/:id`
  - `GET /volunteers`
  - `POST /volunteers`
  - `GET /tasks/:id`
  - `POST /tasks`
  - `GET /tasks/:id/matches`
  - `POST /tasks/:id/assign`
  - `POST /tasks/:id/complete`
  - `POST /tasks/:id/verify`
- Validate all request bodies with `zod`.
- Return plain JSON only; no auth middleware for MVP.
- Compute `urgency_score` synchronously during `POST /needs` using a simplified server-side formula:
  - severity base: `critical=8`, `high=6`, `medium=4`, `low=2`
  - affected count bonus: `min(2, affected_count / 100)`
  - keyword bonus: `+1` if description/title includes urgent keywords
  - final cap: `10`
- Sort dashboard data by `urgency_score desc`, then `created_at desc`.
- Implement task state transitions strictly as:
  - `open -> assigned -> in_progress -> completed -> verified`
- For MVP simplification:
  - `assign` sets `assigned_to` and `status=assigned`
  - `complete` sets `status=completed`, `completion_note`, `completed_at`, and decrements `active_tasks`
  - `verify` sets `status=verified`, increments `total_deployments`, and marks linked need `resolved`
- Add a lightweight seed route or startup seed script for demo data. Prefer a seed script, not an exposed API route.

### Matching behavior
- Reuse `packages/core` scoring functions as the base.
- Add a backend adapter that converts DB rows into the `VolunteerForMatch` and `TaskForMatch` shapes used by the shared scoring utilities.
- Matching endpoint behavior:
  - load task and all active volunteers
  - filter eligible volunteers
  - score each volunteer
  - return top 3 ranked results with score breakdown and volunteer summary
- If both task and volunteer have coordinates, use current haversine proximity logic.
- If coordinates are missing for either side:
  - if `location_text` matches exactly after lowercase trim, set a fallback proximity score of `0.8`
  - otherwise set fallback proximity score of `0.5`
- Availability logic stays as currently implemented in `packages/core`.
- Manual assignment override is allowed even if a volunteer is not in the top 3, but the MVP UI only needs top-3 assignment.

### Frontend web app
- Convert mocked screens into working data-driven pages.
- Dashboard page:
  - fetch needs from API on load
  - render urgency-ranked need cards
  - include `Create Task` action per card
  - include a simple `Add Need` button linking to `/submit`
- Submit page:
  - build a real form with fields: title, category, description, location text, severity, affected count
  - submit to `POST /api/v1/needs`
  - redirect to dashboard after success
- Volunteer registry page:
  - add a simple coordinator page to create and list volunteers
  - fields: full name, phone, email, skills, location text, availability, max tasks, active status
- Task creation page:
  - open from a need card
  - prefill task title from the linked need
  - fields: title, description, required skills, estimated hours, deadline, location text, volunteer slots
  - submit to `POST /api/v1/tasks`
  - on success navigate to a task detail / match page
- Match page:
  - fetch `GET /api/v1/tasks/:id/matches`
  - show top 3 volunteers with score, skills, location, availability, active tasks
  - allow `Assign` action
- Task detail page:
  - show task status and assigned volunteer
  - include buttons for `Mark Complete` and `Verify`
  - show simple event log from `task_events`
- Use plain fetch and component state for MVP. Do not add React Query yet.
- Keep Tailwind styling; no redesign beyond making the current screens functional.

### Configuration and local environment
- Add and document these required env vars:
  - web: `NEXT_PUBLIC_API_BASE_URL`
  - api: `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Do not require `REDIS_URL` for MVP execution.
- Keep Docker optional:
  - Supabase can be hosted
  - Redis container stays unused unless later expanding to BullMQ
- Keep Node target aligned to Node 20 in docs, but implementation should avoid Node-22-only features.

## Public Interfaces and Types

- New API contract:
  - `Need`: `id`, `title`, `category`, `severity_self`, `affected_count`, `location_text`, `urgency_score`, `status`, `created_at`
  - `Volunteer`: `id`, `full_name`, `skills`, `location_text`, `availability`, `max_tasks`, `active_tasks`, `is_active`, `total_deployments`
  - `Task`: `id`, `report_id`, `title`, `required_skills`, `deadline`, `location_text`, `status`, `assigned_to`
  - `MatchResult`: `volunteer`, `skillScore`, `proximityScore`, `availScore`, `workloadScore`, `totalScore`, `distanceKm`
- Shared validation types should live in `packages/core` if reused by both API and web; otherwise keep runtime schemas in API only.
- Frontend should treat API as the source of truth and remove all hardcoded placeholder records.

## Test Plan

- API checks:
  - create a need with valid fields and verify returned urgency score and `open` status
  - list needs and confirm urgency sorting
  - create a volunteer and confirm persistence
  - create a task from a need and confirm initial `open` status
  - fetch matches and confirm at most 3 results ordered by descending `totalScore`
  - assign a volunteer and confirm task status becomes `assigned`
  - complete a task and confirm status becomes `completed` and volunteer `active_tasks` decrements
  - verify a task and confirm status becomes `verified`, linked need becomes `resolved`, and volunteer `total_deployments` increments
- UI scenarios:
  - submit a new need from `/submit` and see it on the dashboard
  - create a task from the dashboard and see match suggestions
  - assign a volunteer and complete the task lifecycle from the UI
  - refresh any page involved in the flow and confirm data persists
- Regression checks:
  - `/` redirects to `/coordinator/needs`
  - app does not depend on Redis to run
  - no page still renders placeholder text such as `MVP placeholder form`

## Assumptions and Defaults

- Single-organization demo only; no auth, no roles, no RLS for MVP.
- Supabase is the persistence choice because it is the fastest path to a working demo with minimal infrastructure.
- Redis and BullMQ are explicitly deferred; they are not required for the first working MVP.
- SMS, push notifications, CSV upload, analytics, and OTP are out of scope for this implementation pass.
- Exact geolocation is optional; text location plus optional coordinates is sufficient for hackathon matching.
- Seed data is required so the demo is reliable even if manual entry is partially incomplete.
