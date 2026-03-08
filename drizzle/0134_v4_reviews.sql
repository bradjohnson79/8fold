CREATE TABLE IF NOT EXISTS v4_reviews (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  job_poster_user_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS v4_reviews_job_uniq ON v4_reviews(job_id);
CREATE INDEX IF NOT EXISTS v4_reviews_poster_idx ON v4_reviews(job_poster_user_id);
CREATE INDEX IF NOT EXISTS v4_reviews_created_at_idx ON v4_reviews(created_at);
