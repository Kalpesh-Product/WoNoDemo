# Activity upload: April–September 2026

For already imported records, run `node scripts/updateImportedPresentation.js --db WonoDemoUserData` to preview, then append `--apply`. This renames rooms, removes demo/dummy/synthetic wording from labels in both bundles, and classifies meeting/day-pass visitors and external visits as Client. It fills missing external company names without overwriting existing ones. Only bundle record IDs are updated, transactionally. Regular insert-only reimports do not update existing labels or classifications.

Visitors include a unique synthetic `idProof.idNumber` derived from their ObjectId, compatible with the target's unique ID-proof index. These are test references, not government identity numbers. Preflight checks for duplicate references in the bundle and collisions with other target visitors. No index changes are required.

Missing ticket issue definitions are now handled automatically: ticketIssues.json contains only the source-export definitions used by this bundle. Preflight reports the number missing from the target company without writing. On --apply, missing definitions are added to existing selectedDepartments in the same transaction as the activity import. Existing titles and priorities are preserved. No department is created. This supersedes the original behavior that rejected missing issue titles or stated company configuration was never modified.

"April 26" was interpreted as April 2026. Records cover April 1 through September 9, 2026, 16:08:45 India time. The manifest records the exact cutoff. Future generator runs default to the current instant.

The bundle contains 13 rooms, 276 meetings, 348 tickets, 116 support tickets, 518 visitors, and 518 linked external visits. It reuses company and active unit IDs from the supplied exports and the 24 users already generated in demo-upload. The same eight included departments are used; Legal, Cafe, People and Culture, Expansion, Marketing, and Compliance remain excluded.

Variety includes six meeting durations, internal/external bookings, completed/cancelled meetings, multiple room capacities, five visitor types, sectors, purposes, payment states, five ticket statuses, configured issue titles, and departmental assignments. Historical records are not marked ongoing. Real-time occupancy and upcoming-meeting widgets can legitimately be empty. Priorities are derived by the app from company issue configuration; the exported issues used here are High priority. This bundle does not modify that configuration.

From server in Git Bash, with your target connection URI already exported as DB_URL:

```bash
node scripts/importActivityUpload.js --db WonoDemoUserData
node scripts/importActivityUpload.js --db WonoDemoUserData --apply
```

The first command is read-only. It verifies the existing users, company, departments, units, and target ticket issue configuration. Apply writes only to WonoDemoUserData on cluster0.d9cnr.mongodb.net in a transaction. It inserts missing IDs and preserves existing records. No messages or notifications are sent. No other database is modified. Do not use importDemoUpload.js for this separate activity bundle.

To generate again into a new directory:

```bash
node scripts/buildActivityUpload.js --source 'C:/Users/BIZNest User/Documents/Backup/BIZNest Prototype Data' --from 2026-04-01 --out activity-upload-new
node scripts/importActivityUpload.js --dir activity-upload-new --db WonoDemoUserData
```

Existing IDs are stable for the same generation inputs. Expanding the date range adds records but does not update existing records on reimport. The generator uses fabricated contacts at example.com and USD prices. Tests: `node scripts/activityUpload.test.js`.
