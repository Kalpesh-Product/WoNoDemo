# Leads, job applications and vendors

212 leads across April–September 2026 (24, 28, 33, 38, 43, 46 per month), 30 distinct job applications, and 28 vendors. Vendors per department: Maintenance 2, HR 3, Top Management 4, Tech 5, Sales 2, Finance 3, IT 4, Administration 5. Previously excluded departments remain excluded.

Leads vary across Cold/Mild/Hot/Closed, four service categories, five sources, seven sectors, unit preferences, budget amounts and desk requirements. The service ObjectIds are from the supplied CSV for Co-working, Virtual Office, Workation and Meeting Room; no service records are created. Applicant names, experience, positions, salary expectations, availability and review status vary. Mobile numbers use Indian formatting; emails use names without placeholder prefixes. No resumes, government IDs or bank credentials are fabricated. Salary and budget amounts are USD. Activity dates are in 2026; birth dates are adult years and proposed service starts may be later in 2026.

From server with target DB_URL exported:

```bash
node scripts/importPipelineUpload.js --db WonoDemoUserData
node scripts/importPipelineUpload.js --db WonoDemoUserData --apply
```

Preflight checks company, departments, units, services and identity collisions without writing. Apply inserts missing IDs transactionally only in WonoDemoUserData on cluster0.d9cnr.mongodb.net. Existing records are preserved and reruns do not duplicate this bundle. No notifications or messages are sent. Counts refer to new bundle records, not the database-wide total.

Tests: `node scripts/pipelineUpload.test.js`. Generate into a new folder using `node scripts/buildPipelineUpload.js --source 'C:/Users/BIZNest User/Documents/Backup/BIZNest Prototype Data' --out pipeline-upload-new`.
