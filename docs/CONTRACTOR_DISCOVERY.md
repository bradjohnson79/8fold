# Contractor Discovery Pipeline

Router contractor discovery uses a **jurisdiction-first** pipeline to prevent cross-state/province leakage and improve performance.

## Pipeline Order

1. **Jurisdiction filter** — Match job country and region
2. **Bounding box prefilter** — Geographic window around job
3. **Haversine distance filter** — Exact distance within max radius
4. **Sort by nearest** — Return contractors ordered by distance

## Jurisdiction Filter

Contractors must match the job's jurisdiction:

- `contractor_profiles_v4.country_code = job.country_code`
- `contractor_profiles_v4.home_region_code = job.region_code`

**Single source:** Jurisdiction comes only from `contractor_profiles_v4`. Do not use `contractor_accounts` for jurisdiction to avoid cross-table inconsistencies.

- BC job → BC contractors only
- WA job → WA contractors only
- No cross-border matching

## Bounding Box Prefilter

Before computing exact distance, candidates are filtered by a geographic bounding box:

- `geoBoundingBox(job.lat, job.lng, maxDistanceKm)` computes lat/lng bounds
- `home_latitude BETWEEN latMin AND latMax`
- `home_longitude BETWEEN lngMin AND lngMax`
- `LIMIT 500` (applied after bounding box)

This dramatically reduces the candidate set before haversine.

## Haversine Distance Filter

Exact distance is computed using `haversineKm` from `apps/api/src/jobs/geo.ts`:

- Job coordinates: `jobs.lat`, `jobs.lng`
- Contractor coordinates: `contractor_profiles_v4.home_latitude`, `contractor_profiles_v4.home_longitude`

**Distance rule:** `maxDistanceKm = job.is_regional ? 100 : 50`

- Urban: 50 km
- Regional: 100 km

Do not use `job_type` for distance; use `is_regional`.

## Contractor Coordinate Source

**Contractor coordinates come from `contractor_profiles_v4`**, not from `contractor_accounts`:

| Table | Columns | Usage |
|-------|---------|-------|
| `contractor_profiles_v4` | `home_latitude`, `home_longitude` | Distance calculation |
| `contractor_profiles_v4` | `country_code`, `home_region_code` | Jurisdiction filter |

## Safety Conditions

- **Missing job coords:** Returns `missing_job_coords` when job lat/lng are invalid
- **Missing contractor coords:** Contractors with invalid lat/lng are excluded
- **Empty jurisdiction:** Returns empty when job has no country_code or region_code

## Index

The query uses `idx_contractor_profiles_v4_geo` on `(country_code, home_region_code, home_latitude, home_longitude)` to prune by jurisdiction before scanning coordinates.
