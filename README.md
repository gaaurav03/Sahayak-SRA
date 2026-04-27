# Sahayak MVP (Hackathon Scope)

Functional MVP for smart resource allocation with a single-org demo flow:

1. Submit need
2. View urgency-ranked dashboard
3. Create task from need
4. See top 3 volunteer matches
5. Assign volunteer
6. Mark task complete
7. Verify task and resolve linked need

## Apps

- `apps/web` - Next.js coordinator + submission UI
- `apps/api` - Express REST API with Supabase persistence
- `apps/worker` - deferred for MVP (not required to run)
- `packages/core` - shared scoring helpers

## Required Environment Variables

### Web (`apps/web/.env.local`)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
```

### API (`apps/api/.env`)

```env
PORT=3001
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Supabase Setup

1. Open Supabase SQL editor.
2. Run schema in `apps/api/supabase/schema.sql`.
3. Seed demo data:

```powershell
pnpm.cmd --filter @sahayak/api seed
```

## Run MVP Locally (Windows PowerShell)

```powershell
pnpm.cmd install
pnpm.cmd dev
```

Endpoints:

- Web: http://localhost:3000
- API health: http://localhost:3001/health

## MVP API Endpoints

- `GET /api/v1/needs`
- `POST /api/v1/needs`
- `GET /api/v1/needs/:id`
- `GET /api/v1/volunteers`
- `POST /api/v1/volunteers`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/:id`
- `GET /api/v1/tasks/:id/matches`
- `POST /api/v1/tasks/:id/assign`
- `POST /api/v1/tasks/:id/complete`
- `POST /api/v1/tasks/:id/verify`

## Notes

- This MVP intentionally runs without Redis/BullMQ, Twilio, Firebase, CSV upload, and auth.
- If PowerShell blocks `pnpm`, use `pnpm.cmd`.
