const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const Asset = require('../models/assets/Assets');
const Category = require('../models/category/Category');
const SubCategory = require('../models/category/SubCategories');
const { generateAssets, previewReferences } = require('./generateDemoAssets');

const excluded = new Set(['legal', 'cafe', 'people and culture', 'expansion', 'marketing', 'compliance']);
const normalize = name => name.trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ');
const oid = value => {
  const id = value?.$oid || value;
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw new Error('Invalid reference ObjectId');
  return id.toLowerCase();
};
const stableId = key => crypto.createHash('sha256').update(`wono-demo-assets-v1:${key}`).digest('hex').slice(0, 24);
const equipment = {
  maintenance: [['Tools', 'Power Tools', 'Cordless Drill', 180], ['Equipment', 'Cleaning Equipment', 'Floor Cleaner', 950]],
  hr: [['Office Equipment', 'Printers', 'Document Printer', 320], ['Furniture', 'Office Chairs', 'Ergonomic Chair', 240]],
  'top management': [['Electronics', 'Laptops', 'Executive Laptop', 1500], ['Office Equipment', 'Conference Equipment', 'Conference Display', 900]],
  tech: [['Electronics', 'Laptops', 'Developer Laptop', 1400], ['Electronics', 'Monitors', 'Development Monitor', 350]],
  sales: [['Electronics', 'Tablets', 'Sales Tablet', 550], ['Office Equipment', 'Projectors', 'Presentation Projector', 750]],
  finance: [['Electronics', 'Laptops', 'Finance Laptop', 1100], ['Office Equipment', 'Scanners', 'Document Scanner', 280]],
  it: [['Network Equipment', 'Routers', 'Office Router', 250], ['Electronics', 'Laptops', 'Support Laptop', 950]],
  administration: [['Furniture', 'Desks', 'Office Desk', 400], ['Office Equipment', 'Printers', 'Office Printer', 380]],
};

function generateBundle({ companies, departments, units, count = 20, seed = 42, asOf = new Date().toISOString().slice(0, 10) }) {
  const bundle = { categories: [], subcategories: [], assets: [], departmentUpdates: [], summary: [] };
  for (const company of companies) {
    const companyId = oid(company._id);
    const linked = new Set((company.selectedDepartments || []).map(d => oid(d.department)));
    const companyUnits = units.filter(u => oid(u.company) === companyId && u.isActive !== false);
    const eligible = departments.filter(d => linked.has(oid(d._id)) && !excluded.has(normalize(d.name)));
    if (eligible.length && !companyUnits.length) throw new Error('No active units for company ' + companyId);
    for (const department of eligible) {
      const departmentId = oid(department._id);
      const specs = equipment[normalize(department.name)];
      if (!specs) throw new Error('Add an equipment profile for ' + department.name);
      const categoryIds = [];
      const links = specs.map(([categoryName, subCategoryName, name, price]) => {
        const categoryId = stableId(`${companyId}:${departmentId}:${categoryName}`);
        const subCategoryId = stableId(`${categoryId}:${subCategoryName}`);
        if (!categoryIds.includes(categoryId)) {
          categoryIds.push(categoryId);
          bundle.categories.push({ _id: categoryId, categoryName: `Demo ${department.name} ${categoryName}`, company: companyId, department: departmentId, appliesTo: ['asset'], isActive: true });
        }
        bundle.subcategories.push({ _id: subCategoryId, subCategoryName: `Demo ${department.name} ${subCategoryName}`, department: departmentId, category: categoryId, description: 'Synthetic demo asset subcategory', isActive: true });
        return { categoryId, subCategoryId, name, price };
      });
      const assets = generateAssets({ count, seed, asOf, references: { ...previewReferences, company: companyId, department: departmentId, Category: links[0].categoryId, subCategory: links[0].subCategoryId, location: oid(companyUnits[0]._id) } });
      assets.forEach((asset, i) => {
        const spec = links[i % links.length];
        const id = `DEMO-${departmentId}-${seed}-${String(i + 1).padStart(5, '0')}`;
        Object.assign(asset, { _id: stableId(`${companyId}:${id}`), assetId: id, departmentAssetId: id, secondaryId: id, serialNumber: `SN-${id}`, name: `${spec.name} ${String(i + 1).padStart(3, '0')}`, brand: 'Demo Equipment', price: Math.round(spec.price * (0.9 + (asset.price % 100) / 500) * 100) / 100, Category: spec.categoryId, subCategory: spec.subCategoryId, location: oid(companyUnits[i % companyUnits.length]._id), description: `Synthetic ${department.name} asset. Price is USD.`, createdAt: `${asOf}T00:00:00.000Z`, updatedAt: `${asOf}T00:00:00.000Z` });
        delete asset.vendor;
      });
      bundle.assets.push(...assets);
      bundle.departmentUpdates.push({ updateOne: { filter: { _id: departmentId }, update: { $addToSet: { assetCategories: { $each: categoryIds } } }, upsert: false } });
      bundle.summary.push({ department: department.name, assets: assets.length, categories: categoryIds.length, subcategories: links.length });
    }
  }
  if (!bundle.assets.length) throw new Error('No eligible departments linked to the supplied companies.');
  for (const [key, Model] of [['categories', Category], ['subcategories', SubCategory], ['assets', Asset]]) {
    for (const record of bundle[key]) { const error = new Model(record).validateSync(); if (error) throw error; }
    if (new Set(bundle[key].map(r => r._id)).size !== bundle[key].length) throw new Error('Duplicate IDs in ' + key);
  }
  return bundle;
}

function extendedJson(value, key = '') {
  if (Array.isArray(value)) return value.map(v => extendedJson(v, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, extendedJson(v, k)]));
  if (['_id', 'company', 'department', 'Category', 'subCategory', 'category', 'location', '$each'].includes(key) && typeof value === 'string' && /^[a-f0-9]{24}$/.test(value)) return { $oid: value };
  if (['purchaseDate', 'warrantyExpiryDate', 'rentedExpirationDate', 'createdAt', 'updatedAt'].includes(key)) return { $date: value };
  return value;
}

function main() {
  const { values } = parseArgs({ options: { companies: { type: 'string' }, departments: { type: 'string' }, units: { type: 'string' }, out: { type: 'string', default: 'demo-department-assets' }, count: { type: 'string', default: '20' }, seed: { type: 'string', default: '42' }, 'as-of': { type: 'string', default: new Date().toISOString().slice(0, 10) } } });
  const inputs = Object.fromEntries(['companies', 'departments', 'units'].map(key => {
    if (!values[key]) throw new Error(`--${key} is required`);
    const records = JSON.parse(fs.readFileSync(values[key], 'utf8').replace(/^\uFEFF/, ''));
    if (!Array.isArray(records)) throw new Error(key + ' must contain a JSON array');
    return [key, records];
  }));
  const bundle = generateBundle({ ...inputs, count: Number(values.count), seed: Number(values.seed), asOf: values['as-of'] });
  const output = path.resolve(values.out);
  fs.mkdirSync(output); // Refuse to overwrite an existing bundle.
  for (const key of ['categories', 'subcategories', 'assets', 'departmentUpdates']) fs.writeFileSync(path.join(output, key + '.json'), JSON.stringify(extendedJson(bundle[key]), null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ currency: 'USD', seed: Number(values.seed), asOf: values['as-of'], excluded: [...excluded], departments: bundle.summary, vendor: 'Unset: no vendor references supplied', importOrder: ['categories', 'subcategories', 'departmentUpdates (bulkWrite operations, not collection documents)', 'assets'], databaseWrites: false }, null, 2) + '\n');
  console.table(bundle.summary);
  console.log(`${bundle.assets.length} assets validated. Output: ${output}. No database writes.`);
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { generateBundle, extendedJson };
