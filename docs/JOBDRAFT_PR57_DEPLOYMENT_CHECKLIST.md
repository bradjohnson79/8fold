# JobDraft PR #57 — Deployment Checklist

**PR:** https://github.com/bradjohnson79/8fold/pull/57  
**Base:** `stabilization/base-9.2`  
**Compare:** `fix/job-draft-contract-alignment`  
**Commit:** `998fdc6`

---

## 1) Preconditions ✅

- **Branch:** `fix/job-draft-contract-alignment`
- **Commit:** `998fdc6`
- **No migrations** ✅

---

## 2) PR Created ✅

- **PR #57:** https://github.com/bradjohnson79/8fold/pull/57
- **Base:** stabilization/base-9.2
- **Compare:** fix/job-draft-contract-alignment
- **Status:** All checks passed (5 successful)
- **Vercel:** 8fold-admin, 8fold-api, 8fold-web — Ready + Preview

---

## 3) Preview URLs

| Project | Preview URL |
|---------|-------------|
| **8fold-web** | https://8fold-web-git-fix-job-draft-contract-alignment-anoint.vercel.app |
| **8fold-api** | https://8fold-api-git-fix-job-draft-contract-alignment-anoint.vercel.app |
| **8fold-admin** | (see Vercel deployment) |

---

## 4) Preview Smoke Test Checklist

### Must-pass pages (verified)

| Page | Status |
|------|--------|
| `/` (homepage) | ✅ Loads |
| `/login` | ✅ Loads |
| `/signup` | ✅ Loads |
| `/app/job-poster/post-a-job-v3` | Requires auth (redirects to sign-in) |

### Post-a-job-v3 behavior

- **Without auth:** Redirects to sign-in (expected)
- **With auth:** User must sign in and verify:
  - No red SQL error box
  - Draft loads or creates
  - Page stays stable on refresh
  - No console red errors

### Network check (job-draft API)

- **URL:** `GET https://8fold-api-git-fix-job-draft-contract-alignment-anoint.vercel.app/api/job-draft`
- **Result:** `401 Unauthorized` (expected without auth)
- **No 500** ✅
- **No "relation does not exist"** ✅

---

## 5) Merge to Stabilization Base

**If preview smoke is clean:**

1. Open PR #57: https://github.com/bradjohnson79/8fold/pull/57
2. Click **Squash and merge** (or preferred merge method)
3. Merge into `stabilization/base-9.2`

---

## 6) Promote Stabilization Base → Main

1. Open new PR:
   - **Base:** `main`
   - **Compare:** `stabilization/base-9.2`
2. URL: https://github.com/bradjohnson79/8fold/compare/main...stabilization/base-9.2
3. Create PR → Merge

---

## 7) Production Smoke Test

On https://8fold.app:

- [ ] `/app/job-poster/post-a-job-v3` loads
- [ ] Draft works
- [ ] No red SQL box

---

## 8) Manual Steps

1. **Sign in on preview** (incognito) to fully test post-a-job-v3.
2. **Merge PR #57** when satisfied.
3. **Create promotion PR** (base → main).
4. **Production smoke** after deployment.
