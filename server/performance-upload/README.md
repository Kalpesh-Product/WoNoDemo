# Tasks and performance

529 tasks, 288 KRA/KPA assignments, and 1,922 completion events, April 1–September 11, 2026 (cutoff 11:28:56 India time). Uses the existing eight included departments, 24 generated users, their roles, and company units. Previously excluded departments remain excluded.

Task titles are unique within the bundle and refer to concrete departmental work. Workloads, owners, Self/Department task types, completion rates, Pending/InProgress/Completed states, and monthly volumes vary. Future due dates represent deadlines; activity/completion timestamps do not exceed the cutoff. Daily KRA completion history and monthly KPA completion records match their parent completedDate arrays. Parent status remains Pending as required by the schema; application logic derives achieved performance from completion records. No ratings or annual achievements are fabricated into unsupported fields.

From server with target DB_URL exported:

```bash
node scripts/importPerformanceUpload.js --db WonoDemoUserData
node scripts/importPerformanceUpload.js --db WonoDemoUserData --apply
```

Preflight is read-only and checks company, department membership, users, roles, units, and completion relationships. Apply inserts missing IDs in a transaction only in WonoDemoUserData on cluster0.d9cnr.mongodb.net. It preserves existing records and sends no notifications. No permissions are changed; dashboard visibility still follows the logged-in user's permissions and date filters. Current-day KRA widgets naturally change as days pass; historical series remain available.

Tests: `node scripts/performanceUpload.test.js`. Generator: `node scripts/buildPerformanceUpload.js --source 'C:/Users/BIZNest User/Documents/Backup/BIZNest Prototype Data' --out performance-upload-new`. Use the same bundle for retries; no automatic refresh of existing performance records is performed by the importer.
