# Department budgets

144 budget records: three expense lines per department per month, April–September 2026. Included: Maintenance, HR, Top Management, Tech, Sales, Finance, IT, Administration. Legal, Cafe, People and Culture, Expansion, Marketing, Compliance are excluded.

Combined projected budgets are at most 60% of the four generated revenue verticals each month; actual spending is lower. USD amounts, existing company/department/unit IDs, and 2026 dates are used. The summary is based on the generated revenue scenario; import recalculates the cap against live revenue and subtracts existing budgets. It scales new allocations down if needed, and stops if existing budgets leave insufficient headroom. Existing budgets are not changed. Revenue comparisons use billed totals, not cash collections.

From server with DB_URL exported:

```bash
node scripts/importBudgetUpload.js --db WonoDemoUserData
node scripts/importBudgetUpload.js --db WonoDemoUserData --apply
```

The first command is read-only. Apply uses a transaction, repeats capacity checks, and inserts missing IDs only in WonoDemoUserData on cluster0.d9cnr.mongodb.net. All 144 records passed local schema and allocation validation. No database writes have been performed by the generator.
