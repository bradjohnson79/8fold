-- Enforce lifetime role immutability on internal users.
-- Role must be set at creation time and cannot be modified later.
-- Safe to re-run.

-- Ensure role is always present.
alter table "8fold_test"."User"
  alter column "role" set not null;

-- Do not allow accidental "default role" assignment on inserts.
alter table "8fold_test"."User"
  alter column "role" drop default;

-- Prevent role changes after creation.
create or replace function "8fold_test".user_role_immutable_guard()
returns trigger
language plpgsql
as $$
begin
  if NEW."role" is distinct from OLD."role" then
    raise exception 'ROLE_IMMUTABLE';
  end if;
  return NEW;
end;
$$;

drop trigger if exists user_role_immutable on "8fold_test"."User";
create trigger user_role_immutable
before update of "role" on "8fold_test"."User"
for each row
execute function "8fold_test".user_role_immutable_guard();

