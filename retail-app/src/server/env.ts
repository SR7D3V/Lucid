import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a postgres:// connection string' }),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Restricted, read-only login role used by the admin SQL console. The console is disabled without it.
  SQL_CONSOLE_DATABASE_URL: z.string().url().optional(),
  // Public origin (e.g. https://lucid.example). When set, state-changing requests must come from it.
  APP_ORIGIN: z.string().url().optional(),
  // Number of reverse proxies in front of the app that append to X-Forwarded-For (most hosts: 1).
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  // Transactional email (password reset) via Resend. Development logs emails to the console instead.
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).optional(),
});

let cached: z.infer<typeof schema> | undefined;

export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isProduction = () => env().NODE_ENV === 'production';
