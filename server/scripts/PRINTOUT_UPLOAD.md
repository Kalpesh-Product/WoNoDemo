# Printout entries

With DB_URL exported, run from server:

```bash
node scripts/importPrintoutUpload.js --db WonoDemoUserData
node scripts/importPrintoutUpload.js --db WonoDemoUserData --apply
```

Preflight validates current company users, units, buildings, coworking clients and members and reports monthly entries and page quantities. No database writes occur without --apply. Amounts are page counts, not currency.

Activity spans April 1, 2026 through the current time, on weekdays during office hours. Use --through with an ISO timestamp to fix the cutoff. Page counts, purposes, request times, units and clients vary. Internal requests use the eight previously included departments, preserving the earlier exclusions. Client requests reference existing members and their client's current unit and respect contract and joining dates. Where no eligible member exists on a date, internal requests are used.

Records have natural remarks without placeholder wording. This is illustrative activity for the presentation environment. It does not create clients, members, users, departments or units. It preserves existing printouts and skips its own IDs on reruns. Only WonoDemoUserData on cluster0.d9cnr.mongodb.net is accepted. Inserts use a transaction; no notifications are sent.

Run `node scripts/printoutUpload.test.js` for local validation. Actual import counts depend on live reference data and cutoff date.
