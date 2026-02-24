# Safe Rollback & Reset Deploy State — 2026-02-23

**Mode:** Stabilization only. No new features. No business logic changes.

---

## IMMEDIATE ACTION — Vercel Promotion (Manual)

**Vercel requires login. Perform these steps manually:**

1. Go to [Vercel Dashboard](https://vercel.com) → **8fold-web** project
2. **Deployments** → locate deployment for commit `fc6019ca2f527bee5c72bc148cdb261d0f6a71e3`
3. If not found: use deployment for `b9b157f` (main — equivalent, no c9aa503)
4. **⋯** → **Promote to Production**
5. Confirm:
   - [ ] Old Job Post UI
   - [ ] No structured address fields
   - [ ] No AI appraisal modal
   - [ ] No console errors

---

## CONFIRM STATE (After Promotion)

| Check | Status |
|-------|--------|
| Current production commit hash | _fc6019c or b9b157f_ |
| No `/api/job-draft/appraise` calls | _Old flow does not call it_ |
| No `address_line1` reference | _Pre-v3 flow uses address_full only_ |
| API contract stable | _Web and API aligned_ |

---

## FREEZE FEATURE BRANCH

- [ ] PR #61 remains **open** (do not merge)
- [ ] Do not rebase `feat/job-draft-v3-structural-purification`
- [ ] Do not delete branch

---

## CLEAN REDEPLOY (Later — Before Redeploying v3)

1. [ ] Migration `0075_jobs_address_line1.sql` created (done)
2. [ ] Commit migration
3. [ ] Add `address_line1` to [apps/api/db/schema/job.ts](apps/api/db/schema/job.ts) when merging API changes
4. [ ] Merge API changes
5. [ ] Run migrations on production DB
6. [ ] Deploy API
7. [ ] Confirm API health
8. [ ] Promote Web (merge PR #61 or promote preview)
9. [ ] Verify end-to-end Job Post v3 flow

---

## PHASE 1 — Last Stable Web Commit

### Job Post v3 commit (to revert)

| Item | Value |
|------|-------|
| **Commit** | `c9aa503` |
| **Message** | `feat(job-post): structured address, photo upload, AI appraisal flow (no DB write until confirm)` |
| **Branches** | `feat/job-draft-v3-structural-purification`, `deploy/financial-lockdown-clean` |
| **On main?** | **No** — `main` does not contain this commit |

### Last stable commit (before Job Post v3)

| Item | Value |
|------|-------|
| **Commit** | `fc6019c` (full: `fc6019ca2f527bee5c72bc148cdb261d0f6a71e3`) |
| **Message** | `fix(web): Job title field displays typed input immediately in post-a-job-v3` |
| **Parent of** | `c9aa503` |

**Deployment confirmation:** Cannot be verified from the repo. Confirm in Vercel that `fc6019c` (or its PR merge equivalent) was deployed successfully and API was in sync.

---

## PHASE 2 — Revert Production Web

### Branch situation

- `c9aa503` is **not** on `main`. It exists on:
  - `feat/job-draft-v3-structural-purification`
  - `deploy/financial-lockdown-clean` (in ancestry)
- If production was **promoted from a preview** of one of these branches, that preview included `c9aa503`.

### Option A — Vercel (preferred)

1. Open Vercel → 8fold-web project.
2. Deployments → find the deployment for commit `fc6019c` (or the last known stable build).
3. **Promote to Production** that deployment.
4. Confirm 8fold.app returns to previous Job Post behavior.

### Option B — Git revert (if production tracks a branch that has c9aa503)

**If production tracks `feat/job-draft-v3-structural-purification` or `deploy/financial-lockdown-clean`:**

```bash
git checkout main
git pull origin main
# If c9aa503 was merged to main via a different path, use:
git revert c9aa503 --no-edit
git push origin main
```

**Note:** Since `c9aa503` is not on `main`, the revert must target the branch that production actually uses. If production uses `main`, Option A (Vercel redeploy) is the correct path.

### Post-revert checks

- [ ] Web redeploy triggers
- [ ] 8fold.app returns to previous Job Post behavior
- [ ] No broken API calls (no 500s from new endpoints)
- [ ] No missing column errors

---

## PHASE 3 — Freeze Feature Branch

| Branch | Action |
|--------|--------|
| `feat/job-draft-v3-structural-purification` | **Do NOT merge PR #61** |
| | Keep branch intact |
| | Do NOT delete |
| | Do NOT rebase |

---

## PHASE 4 — Verify Production Stability

After revert, manually verify:

| Test | Expected |
|------|----------|
| Post a job (old flow) | Works |
| Submit | Succeeds |
| Console | No 500s |
| API | No errors |
| Web + API versions | Aligned |
| Schema | No missing column errors, no contract mismatches |

**Verification status:** _To be filled after revert._

---

## PHASE 5 — Clean Redeploy Plan (Preparation Only — Do NOT Deploy Yet)

### Correct order for future redeploy

1. **Merge API changes first**
   - Ensure all API migrations and schema changes are merged and deployed.

2. **Run migrations**
   - `0075_jobs_address_line1.sql` adds `address_line1` to `public.jobs`. Created and ready for clean redeploy.

3. **Deploy API**
   - Deploy API to production.
   - Verify API health endpoint responds.

4. **Promote Web**
   - Promote Web only after API is live and healthy.

5. **Verify end-to-end**
   - Test Job Post v3 flow against production API.
   - Confirm contract alignment.

### Redeploy checklist

- [ ] API changes merged
- [ ] Migrations run (including `0075_jobs_address_line1.sql`)
- [ ] API deployed
- [ ] API health verified
- [ ] Web promoted
- [ ] End-to-end Job Post v3 verified

---

## Summary

| Item | Value |
|------|-------|
| **Stable commit hash** | `fc6019c` |
| **Job Post v3 commit (revert target)** | `c9aa503` |
| **Revert commit hash** | _N/A until revert is performed_ |
| **Deployment status** | Web reverted via Option A or B; API remains on stable version |
| **Production stable** | _To be confirmed after revert and Phase 4 verification_ |

---

## Rules Applied

- No new commits except revert commit
- No schema modifications during rollback
- No feature edits
- No additional refactors
- No force pushes
- Controlled rollback only
