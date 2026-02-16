-- Job lifecycle: add DISPUTED to JobStatus enum (add-only).
ALTER TYPE "8fold_test"."JobStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';

