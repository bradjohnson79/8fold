CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'STANDARD',
  created_at TIMESTAMP DEFAULT now(),
  disabled_at TIMESTAMP NULL
);
