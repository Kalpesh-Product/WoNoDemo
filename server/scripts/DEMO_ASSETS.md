# Demo asset generator

Date rule for all future demo collections: generate activity dates within the current calendar year, up to the generation date. Asset purchase dates follow this rule; warranty and rental expiry dates are calculated from purchase dates and may extend into later years. The default generation date is today; explicit `--as-of` values make historical runs reproducible within that date's calendar year.

## Department bundle using existing exports

Use `generateDepartmentAssets.js` for the current multi-department dataset:

```sh
node scripts/generateDepartmentAssets.js --companies "path/to/companies.json" --departments "path/to/departments.json" --units "path/to/units.json" --count 20 --seed 42 --as-of 2026-09-09 --out demo-department-assets
```

The output directory must not already exist. Existing company, department, and active unit IDs are reused. Departments must be listed in the company's selectedDepartments. Legal, Cafe, People and Culture, Expansion, Marketing, and Compliance are excluded. Unknown included department names fail explicitly so an equipment profile can be added.

The generated bundle contains categories, subcategories, assets, and a separate departmentUpdates operation file. Import categories first, then subcategories, apply departmentUpdates using MongoDB bulkWrite, then import assets. The category, subcategory, and asset files are MongoDB Extended JSON arrays (ObjectIds and dates retain their types). departmentUpdates is NOT a collection import file; parse its Extended JSON before executing the operations. Updates only add category references to existing departments and never upsert departments. No new company, department, or unit documents are generated.

The supplied IDs must already exist in wonodemo before importing. No database connection is made by the generator. Deterministic IDs support a separately reviewed upsert workflow; blindly importing the same files twice will cause duplicate IDs. Vendor is omitted because no vendor export was supplied and the schema makes it optional. All assets are unassigned. Prices are synthetic USD amounts. The bundle does not include company contact details or source unit images.

The generated `server/demo-department-assets` bundle supersedes the earlier single-department preview described below.

Run from `server`:

```sh
node scripts/generateDemoAssets.js --count 20 --seed 42 --as-of 2026-09-09
node --test scripts/generateDemoAssets.test.js
```

The generator creates an offline JSON preview and validates every asset against the existing Mongoose model. It never connects to MongoDB. Output files must not already exist; choose another `--out` path for another run.

This first dataset contains laptops for one department and one laptop subcategory. Names, synthetic brands, USD prices, purchase dates, ownership, and maintenance states vary. All assets are unassigned, since assigning an asset requires a separate assignment record. Prices are generated directly in USD, not converted from company data.

The same seed, count, reference IDs, and as-of date reproduce the same records. Changing the seed creates another batch with different IDs. Reimporting the same batch would collide with unique asset IDs; this is not an upsert importer.

## Preparing actual target references

Preview IDs are placeholders. To prepare records for wonodemo, create a JSON file containing actual target ObjectId strings for `company`, `department`, `vendor`, `Category`, `subCategory`, and `location`. Pass it using `--refs references.json --out demo-assets.review.json`.

Verify that the vendor, department, category, subcategory, and unit belong to the intended demo company and that the subcategory is a laptop subcategory under the selected category. The script checks ID syntax, not database existence or ownership. Its JSON output is an envelope with an `assets` array, not a direct mongoimport file. No database insertion is included in this first trial.

Before using the existing CSV importer, address its field mismatch: it currently writes `category` and `unit`, while the Asset schema expects `Category` and `location`. This generator uses the schema's actual field names.
