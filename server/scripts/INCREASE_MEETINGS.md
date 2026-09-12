# Additional meeting activity

From server, with DB_URL exported for the target cluster:

```bash
node scripts/increaseMeetings.js --db WonoDemoUserData
node scripts/increaseMeetings.js --db WonoDemoUserData --apply
```

Creates illustrative meeting activity from April 1, 2026 through the current time, increasing weekday booking volume over the period. Partial months remain partial. An optional --through timestamp fixes the cutoff. Preflight reports achievable monthly counts and paid USD revenue using the live rooms and availability.

Uses existing client visitors, users from the previously imported eight departments, and active rooms currently in the database. IDs from earlier room uploads are no longer excluded. Rooms need a natural name, at least two seats, and an active company unit. External meetings require a positive hourly rate. Existing room rates must already be in USD. Deleted rooms are not recreated.

Each new external meeting receives a linked external visit and meeting revenue. No new visitor profiles or rooms are created. Missing revenue is restored for eligible existing external meetings in the date range, including those outside previous uploads, using their recorded payment amounts. Cancelled meetings are excluded. Missing references, placeholder text, absent payment amounts and inconsistent totals are reported rather than guessed. Revenue room-name labels are refreshed from current room records.

The importer preserves existing meeting room assignments. On --apply it recreates dropped collections before the insert transaction and restores the revenue company index. Preflight does not create collections or write records. Existing financial amounts remain unchanged. It does not delete orphaned visits left behind by manual meeting deletion.

The importer checks room, host, and meeting-client conflicts, validates documents, and inserts transactionally into WonoDemoUserData only. Reruns skip the same generated meeting IDs. Run while nobody is booking rooms to avoid races with live booking activity. Existing financial amounts are preserved.

Local verification: `node scripts/increaseMeetings.test.js`.
