# Dependency Guardrails (Monorepo Policy)

These rules are **enforced policy** for the 8Fold monorepo. They exist to prevent dependency topology drift (especially ORM duplication) and to keep database responsibility contained to the backend platform boundary.

---

## 1) Dependency Ownership Rule (Drizzle)

- **Allowed**: `drizzle-orm` may exist **ONLY** in `apps/api/package.json`.
- **Forbidden**: `drizzle-orm` must **never** be added to:
  - repo root `package.json`
  - `apps/web`
  - `packages/*` (shared packages)
  - experimental folders or scripts
  - any other workspace package

**Enforcement**: If an agent (Cursor) adds `drizzle-orm` anywhere else, the task **must fail** and be rolled back.

---

## 2) Prisma Isolation Rule

- Prisma must **never** live in the **same package** as Drizzle.
- If Prisma is still used:
  - it must live in a **separate package**
  - it must not share database responsibility with Drizzle
- If Prisma is legacy-only:
  - it must be treated as **deprecated** and removed when feasible

---

## 3) pnpm Override Enforcement (Single Drizzle Resolution Tree)

Root `package.json` must contain and preserve:

```json
{
  "pnpm": {
    "overrides": {
      "drizzle-orm": "0.45.1"
    }
  }
}
```

**Enforcement**:
- Cursor must **never remove or alter** this override.
- Any dependency work must keep `drizzle-orm` pinned to `0.45.1` to prevent duplicated physical installs.

---

## 4) Lockfile Guard (Pre-install topology check)

Before any dependency install (`pnpm install`), Cursor must:

- Run `pnpm why drizzle-orm`
- Confirm **only one** instance exists

If multiple exist → **STOP** and report. No silent installs.

---

## 5) No Cross-Package ORM Imports

Cursor must never:

- import DB clients across package boundaries (example: `import { db } from "apps/api/..."`)

**Rule**: All DB logic stays inside `apps/api`. Other packages interact with data **only via API calls**.

---

## 6) No Implicit Dependency Additions

If Cursor adds a dependency, it must explicitly state:

- **Why** the dependency is required
- **Which package** it is being added to
- Confirmation it does **not** duplicate an existing dependency
- Confirmation of peer dependency compatibility

No “auto-added by tool” dependencies without explanation.

---

## 7) Build Gate Rule (Post-change verification)

After **any** dependency changes, Cursor must run and confirm:

- `pnpm install`
- `pnpm why drizzle-orm` (must show a single instance)
- `pnpm run build`

If any step fails → revert and report.

---

## Notes (implementation status)

These guardrails define the target platform boundary. If the current repo violates any rule (e.g. `drizzle-orm` declared outside `apps/api`), that is considered **technical debt** and must be addressed in a dedicated remediation pass.

