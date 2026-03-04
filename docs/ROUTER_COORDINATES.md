# Router & Contractor Coordinates

## Contractor Coordinates Source

**Contractor coordinates for distance calculations come from `contractor_profiles_v4`**, not from `contractor_accounts`.

| Table | Columns | Usage |
|-------|---------|-------|
| `contractor_profiles_v4` | `home_latitude`, `home_longitude` | Used for job ↔ contractor distance (Haversine) |
| `contractor_accounts` | — | No lat/lng columns |

Routing services (`routerStage2ContractorSelectionService`, `routerEligibleContractorsService`) join `contractor_profiles_v4` with `contractor_accounts` for eligibility checks, but distance is computed using `contractor_profiles_v4.home_latitude` and `contractor_profiles_v4.home_longitude`.

## Job Coordinates

Job coordinates come from `jobs.lat` and `jobs.lng` (Google Places coordinates).

## Router Coordinates

Router profile coordinates (`router_profiles_v4.home_latitude`, `home_longitude`) are **not used for routing logic**. Router distance calculations are based on job location → contractor location only. The router acts as a matching coordinator. Router coordinates are optional (nullable).
