# Jobs Routing Architecture

## Canonical /jobs Namespace

The `/jobs` route tree is reserved for canonical job listings. It must remain strictly hierarchical and deterministic.

### Allowed Routes

| Route | Example |
|-------|---------|
| `/jobs` | `/jobs` |
| `/jobs/[country]/[regionCode]` | `/jobs/US/CA`, `/jobs/CA/BC` |
| `/jobs/[country]/[regionCode]/[city]` | `/jobs/US/CA/san-francisco`, `/jobs/CA/BC/vancouver` |

### Forbidden Route Patterns

These patterns cause ambiguous matches and can hang the site:

- `/jobs/[region]`
- `/jobs/[region]/[city]`
- `/jobs/[state]`
- `/jobs/[province]`
- `/jobs/[slug]`
- `/jobs/[location]`

Example collision: `/jobs/ca/bc` could resolve to `[country]/[regionCode]` (BC province) or `[region]/[city]` (region=ca, city=bc).

### Location Landing Pages

Future regional browsing features must **not** use the `/jobs` namespace. Use instead:

- `/regions/{region}` — e.g. `/regions/alabama`, `/regions/british-columbia`
- `/locations/{region}`
- `/geo/{region}`

These pages can link to the canonical jobs route: `/jobs/US/AL`, `/jobs/CA/BC`.

### Build-Time Validation

`scripts/validate-jobs-routes.ts` runs before every build. Adding a forbidden route will fail the build immediately.
