# Demo upload

This bundle supersedes demo-department-assets and demo-assets.preview.json. Import this bundle once; do not import the older asset files first.

Collections in import order: roles (8), userdatas (24), categories (23), subcategories (16), items (24), assets (160), assignassets (40), inventories (24). departmentUpdates.json contains update operations, not collection documents. The importer applies them to existing departments.

Company, department, and unit IDs come from the supplied backup exports. No company, department, or unit documents are created. Each included department gets one synthetic demo role and three synthetic users with new deterministic IDs. Five assets per department are distributed among those users; the first user is the recorded creator/approver. Users' assignedAsset arrays link back to their assets. The old company-export admin IDs are no longer required by this bundle. Existing company admin settings are unchanged. Demo users have no passwords or permission profiles: these are employee records, not configured login accounts. Vendors are unset. Prices are synthetic USD. Joining, purchase, and activity dates are in 2026; birth dates represent adults, and warranty/rental expiration dates can extend later.

Excluded departments: Legal, Cafe, People and Culture, Expansion, Marketing, Compliance.

From the server directory in PowerShell:

```powershell
$env:DB_URL = 'mongodb+srv://USERNAME:PASSWORD@cluster0.d9cnr.mongodb.net/WonoDemoUserData'
node scripts/importDemoUpload.js --dir demo-upload --db WonoDemoUserData
node scripts/importDemoUpload.js --dir demo-upload --db WonoDemoUserData --apply
```

Use the supplied target cluster hostname `cluster0.d9cnr.mongodb.net` and database `WonoDemoUserData`. The importer checks that exact hostname. Keep credentials out of committed files.

In Git Bash, set the variable with `export DB_URL='YOUR_ACTUAL_CONNECTION_URI'` instead of the PowerShell assignment above. The importer reads the exported `DB_URL`; it does not automatically load a `.env` file.

The first command checks the target references without writing. The apply command uses a transaction; any failure rolls back the import. Existing document IDs are preserved via insert-only upserts. If earlier asset files were imported with different assignment states, this importer fails instead of overwriting those assets. Category IDs are added to existing departments using addToSet. Transactions require an Atlas/replica-set deployment. Local checks passed; target database checks have not been run.

To regenerate into a NEW output directory:

```powershell
node scripts/buildDemoUpload.js --source 'C:\Users\BIZNest User\Documents\Backup\BIZNest Prototype Data' --as-of 2026-09-09 --out demo-upload-new
```

Files use MongoDB Extended JSON to preserve ObjectIds and dates. Prefer the supplied importer over separate manual imports so dependency checks, department updates, and assignment consistency are handled together.
