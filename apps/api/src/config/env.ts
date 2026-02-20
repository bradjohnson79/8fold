/**
 * Environment variable validation and typed config
 * Fails fast on startup if required vars are missing
 */

const requiredVars = {
  DATABASE_URL: process.env.DATABASE_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
} as const;

const optionalVars = {
  OPEN_AI_API_KEY: process.env.OPEN_AI_API_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  NOMINATIM_USER_AGENT: process.env.NOMINATIM_USER_AGENT,
} as const;

// Validate required vars
for (const [key, value] of Object.entries(requiredVars)) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  database: {
    url: requiredVars.DATABASE_URL!,
  },
  stripe: {
    secretKey: requiredVars.STRIPE_SECRET_KEY!,
    webhookSecret: optionalVars.STRIPE_WEBHOOK_SECRET,
  },
  openai: {
    apiKey: optionalVars.OPEN_AI_API_KEY,
  },
  nominatim: {
    userAgent: optionalVars.NOMINATIM_USER_AGENT || "8FoldLocal/1.0 (contact@yourdomain.com)",
  },
} as const;
