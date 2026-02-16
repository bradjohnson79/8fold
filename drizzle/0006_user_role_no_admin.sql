-- Option A: Admins are system operators, not marketplace users.
-- Prevent marketplace `User` rows from using role = ADMIN.
-- This keeps `User.email` uniqueness intact while isolating AdminUser.

-- Cleanup any legacy admin-actor rows (if they exist)
DELETE FROM "8fold_test"."User"
WHERE ("role")::text = 'ADMIN';

-- Guardrail: disallow ADMIN going forward
ALTER TABLE "8fold_test"."User"
  DROP CONSTRAINT IF EXISTS user_role_not_admin;

ALTER TABLE "8fold_test"."User"
  ADD CONSTRAINT user_role_not_admin
  CHECK (("role")::text <> 'ADMIN');

