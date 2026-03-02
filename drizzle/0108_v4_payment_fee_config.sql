CREATE TABLE IF NOT EXISTS "public"."v4_payment_fee_config" (
  "id" text PRIMARY KEY NOT NULL,
  "payment_method" text NOT NULL,
  "percent_bps" integer NOT NULL,
  "fixed_cents" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "v4_payment_fee_config_method_uq"
  ON "public"."v4_payment_fee_config" ("payment_method");

INSERT INTO "public"."v4_payment_fee_config" (
  "id",
  "payment_method",
  "percent_bps",
  "fixed_cents",
  "created_at",
  "updated_at"
)
VALUES (
  'default-card',
  'card',
  290,
  30,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;
