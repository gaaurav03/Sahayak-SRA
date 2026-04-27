# Sahayak Web App

Next.js coordinator and submission UI for the Sahayak hackathon MVP.

## Routes

- `/` redirects to `/coordinator/needs`
- `/coordinator/needs` shows the urgency-ranked needs dashboard
- `/submit` creates a new need
- `/coordinator/volunteers` manages volunteer records
- `/coordinator/tasks/new?report_id=...` creates a task from a need
- `/coordinator/tasks/[id]/matches` shows top volunteer matches
- `/coordinator/tasks/[id]` shows task detail, completion, and verification actions

## Environment

Create `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
```

## Run

From the repo root in PowerShell:

```powershell
pnpm.cmd dev
```

Web runs on `http://localhost:3000`.

## Notes

- The web app expects the Express API to be running on `localhost:3001` unless overridden.
- Data is fetched from the API at request time; placeholder dashboard data has been removed.
- Redis, BullMQ, Twilio, Firebase, and auth are intentionally out of scope for this MVP.
