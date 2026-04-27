import dotenv from 'dotenv';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

dotenv.config();

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Placeholder queues; we’ll add processors next.
const notificationsQueue = new Queue('notifications', { connection });

async function main() {
  // eslint-disable-next-line no-console
  console.log('[worker] up');
  // eslint-disable-next-line no-console
  console.log(`[worker] redis: ${redisUrl}`);

  // Smoke check: enqueue and immediately remove a noop job
  const job = await notificationsQueue.add('noop', { ok: true });
  await job.remove();

  // Keep process alive
  // eslint-disable-next-line no-console
  console.log('[worker] ready');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[worker] fatal', err);
  process.exitCode = 1;
});
