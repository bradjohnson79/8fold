# 8fold.app Homepage Hang — Diagnostic Steps

Use this to isolate which import/component causes the production hang.

## Step 1 — Static page (CURRENT)

**Applied:** `page.tsx` is now a minimal static component with zero imports.

**Deploy and test:** If https://8fold.app loads → proceed to Step 2.  
If it still hangs → proceed to Step 3.

---

## Step 2 — Re-add components one at a time (only if Step 1 works)

Restore from backup and add components incrementally. Deploy after each:

1. **HeroBackgroundVideo** — `git show HEAD~1:apps/web/src/app/page.tsx` has full page; add only Hero section + HeroBackgroundVideo import
2. **LocationSelector** — Add LocationSelector import + section
3. **HomeJobFeedClient** — Add HomeJobFeedClient import + section
4. **HomepageFAQSection** — Add HomepageFAQSection import + section

Whichever deploy brings back the hang → that component/import is the culprit.

---

## Step 3 — Disable middleware (only if Step 1 still hangs)

```bash
mv apps/web/src/middleware.ts apps/web/src/middleware.disabled.ts
```

Deploy and test. If it loads → middleware (Clerk) is the cause.

---

## Step 4 — Minimal layout (only if Step 3 still hangs)

Replace `apps/web/src/app/layout.tsx` with:

```tsx
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

Deploy and test. If it loads → layout (ClerkProvider, Header, Footer) is the cause.

---

## Step 5 — Report

Note which step made the hang disappear. That identifies the root cause.
