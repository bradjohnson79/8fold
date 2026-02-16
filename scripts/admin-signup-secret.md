Your shared signup code (dev)
I set this in apps/admin/.env.local and restarted the admin server:
ADMIN_SIGNUP_SECRET: UINnaOVjIr_zYDbIz9AyaIiKEtkYHmIq
How to use it
Send an admin to:
http://localhost:3002/admin-signup
They will need:
the signup code above
their email + password
(Optional single-link mode):
http://localhost:3002/admin-signup?code=UINnaOVjIr_zYDbIz9AyaIiKEtkYHmIq