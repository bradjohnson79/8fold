# Admin UI Error Capture Instructions

## Summary
I've created an automated script to capture failing admin API endpoints, but it requires manual login as the admin interface doesn't have autofilled credentials.

## Current Status
- ✅ Script created: `capture-admin-errors.mjs`
- ✅ Playwright browser automation installed
- ⏳ Awaiting manual login to proceed

## Issue Encountered
The admin login page at `http://localhost:3002/login` does not have:
- Autofilled credentials
- Standard `name` or `id` attributes on form inputs (they use inline styles only)
- This makes automated login difficult without hardcoded credentials

## How to Run the Capture

### Option 1: Run the automated script (Recommended)
```bash
node capture-admin-errors.mjs
```

**Steps:**
1. Run the command above
2. A Chromium browser window will open automatically
3. Within 60 seconds, manually log into the admin UI using valid credentials
4. The script will then automatically:
   - Navigate through all admin pages (Jobs, Contractors, Job Drafts, Payout Requests, etc.)
   - Capture all API requests to `/api/admin/*`
   - Record any HTTP 500 or other error responses with their response bodies
   - Log console errors
   - Save a detailed report to `admin-error-report.json`

### Option 2: Manual Browser DevTools Capture

If the automated script doesn't work, you can manually capture the data:

1. Open http://localhost:3002 in Chrome/Firefox
2. Open DevTools (F12) → Network tab
3. Filter by: `admin`
4. Log in to the admin UI
5. Click through each navigation item once:
   - Dashboard
   - Jobs
   - Contractors
   - Job Drafts
   - Payout Requests
   - Routing Activity/Assignments
   - Support
   - Settings
   - Audit Logs
   - Stats
   
6. For each page, look for:
   - Requests with 500 status code
   - Red/failed requests in the Network tab
   - Errors in the Console tab

7. For each failed request:
   - Right-click → Copy → Copy as cURL
   - Or click the request → Response tab → copy response body
   - Note which page triggered it

## Expected Output Format

The script will generate a JSON file with this structure:

```json
{
  "failedEndpoints": [
    {
      "page": "http://localhost:3002/jobs",
      "method": "GET",
      "url": "http://localhost:3002/api/admin/jobs",
      "status": 500,
      "responseBody": "{\"error\":\"Database connection failed\",...}"
    }
  ],
  "consoleErrors": [
    {
      "page": "http://localhost:3002/dashboard",
      "message": "TypeError: Cannot read property 'map' of undefined"
    }
  ],
  "pageVisited": [
    { "path": "http://localhost:3002/", "name": "Dashboard" },
    { "path": "http://localhost:3002/jobs", "name": "Jobs" }
  ]
}
```

## Known Issues
- There's a 404 error on the login page for a resource (visible in console)
- Login requires manual credentials entry

## Next Steps
1. Run the script with `node capture-admin-errors.mjs`
2. Log in within 60 seconds when the browser opens
3. Wait for the script to complete (~2-3 minutes)
4. Review the generated `admin-error-report.json` file
5. Share the failing endpoints with the development team

## Script Features
- ✅ Captures ALL network requests to `/api/admin/*`
- ✅ Records HTTP status codes (especially 500/4xx errors)
- ✅ Saves response bodies (truncated to 2KB for large responses)
- ✅ Logs console errors
- ✅ Tracks which page triggered each error
- ✅ Generates both terminal output and JSON report
- ✅ Non-destructive (read-only, no code modifications)
