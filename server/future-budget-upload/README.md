# October 2026–March 2027 budget forecasts

144 illustrative forecast entries: three expense lines for each of eight departments each month. Uses existing company, department, and unit IDs from the earlier budget bundle. Legal, Cafe, People and Culture, Expansion, Marketing, and Compliance remain excluded.

All amounts are USD. Actual amounts and actual dates are null, payment status is Unpaid, and isOnlyBudget is true. Allocations vary from the September scenario by department, expense line, and month. Future due dates span October 2026 through March 2027; creation dates are September 12, 2026.

These are illustrative projections for presentation purposes, not actual company spending or earned revenue. Monthly totals stay below the prior USD 187,114 generated revenue reference; no future revenue is invented or required by the importer. Existing allocations count toward that ceiling.

From `server`, with the target `DB_URL` exported:

```bash
node scripts/importFutureBudgetUpload.js --db WonoDemoUserData
node scripts/importFutureBudgetUpload.js --db WonoDemoUserData --apply
```

The first command validates and previews without writes. The second inserts only into WonoDemoUserData on cluster0.d9cnr.mongodb.net, in a transaction. Existing entries are preserved; reruns skip the same IDs. Overlapping expense lines with other IDs stop the import for review. No company, unit, or department records are created.

Regenerate and validate locally:

```bash
node scripts/buildFutureBudgetUpload.js
node scripts/futureBudgetUpload.test.js
```

See summary.json for monthly totals and department allocations.
