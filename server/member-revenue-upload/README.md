# Members and recurring revenue

## Current revenue scenario (source-pattern revision)

Use `node scripts/updateRevenueScenario.js --db WonoDemoUserData` for the read-only preview, then append `--apply`. This supersedes the earlier amount updater for this revenue scenario. It updates only the generated revenue IDs, inserts the additional workation line items, and aligns the 18 referenced coworking client desk rates. Existing payment states, transaction dates, unit allocations, and member records are preserved. Apply is transactional and restricted to WonoDemoUserData on cluster0.d9cnr.mongodb.net.

The four supplied exports were inspected: 683 coworking rows, 254 virtual-office rows, 94 alternate rows, and 3 workation rows. The generated scenario follows monthly desk billing, virtual-office taxable/gross billing, workation cab/food/event line items, and alternate parking/centre-management/monthly-pass charges. Amounts are newly selected USD scenario values, not copied or currency-converted source figures. The generated 18% tax proportions mirror the examples, not a tax-compliance determination. Virtual-office rentStatus is Active (contract status), with boolean status for payment, matching the source structure. Cafe-related sales remain excluded.

The update previews full billed totals by month; paid-only widgets will show lower totals. Earlier months have fewer clients because their actual contract start dates are respected. Preview totals are in monthly-revenue-preview.json; live coworking allocations can change these totals. The paid-revenue chart now shows USD directly instead of dividing by 100,000 and labelling the axis in lakhs.

Member contacts now use +91 mobile formatting and first-name email addresses at client-name .com domains. Updated illustrative USD package amounts: virtual office 150–325/month, workation from 1,500/package, alternate services from 250/invoice. These are scenario prices, not researched market rates. Coworking revenue continues to use live contracted desk rates. This supersedes the original price ranges below.

To update already imported bundle records, preview with `node scripts/updateMemberRevenueDetails.js --db WonoDemoUserData`, then append `--apply`. This updates only member contact fields and the related virtual-office/workation/alternate monetary fields, preserving IDs, dates, statuses, client links, and desk allocations. Missing records are reported and not inserted by the updater. Regular insert-only imports do not change existing amounts.

Preview: 53 coworking members across 18 clients (1–6 members per client), 63 coworking revenue entries, 42 virtual-office revenue entries, 39 workation revenue entries, and 24 alternate revenue entries. All activity runs from April 2026/client start through September 10, 2026. Birth dates are adult birth years; contract expiry dates can extend beyond 2026. Values are USD with zero generated tax, matching the existing dataset convention.

From server in Git Bash with the target URI exported as DB_URL:

```bash
node scripts/importMemberRevenueUpload.js --db WonoDemoUserData
node scripts/importMemberRevenueUpload.js --db WonoDemoUserData --apply
```

Preflight is read-only. The importer regenerates the preview from live clients to respect actual unit assignments, desk counts, rates, service IDs, and contract dates. It checks existing member occupancy and displays the final team sizes. Clients, units, rates, and services are not modified. Monthly client revenue already present is skipped; member and alternate-revenue IDs are insert-only. Apply writes transactionally only to WonoDemoUserData on cluster0.d9cnr.mongodb.net. No notifications are sent.

Coworking revenue bills the contracted open/cabin desks, not the member headcount. Virtual-office prices vary from 65–125 USD monthly; workation packages vary by client and month. These prices are generated data, not existing contractual charges. Alternate income includes printing, equipment rental, workshops, and lockers. Member names contain no placeholder labels or numbered suffixes; email identifiers remain unique.

Tests: `node scripts/memberRevenueUpload.test.js`. Regenerate into a new folder with `node scripts/buildMemberRevenueUpload.js --out member-revenue-upload-new`.
