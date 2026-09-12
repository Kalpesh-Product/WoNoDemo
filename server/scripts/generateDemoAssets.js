const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const Asset = require("../models/assets/Assets");

// These IDs are placeholders for offline previews, not database references.
const previewReferences = {
  company: "000000000000000000000001",
  department: "000000000000000000000002",
  vendor: "000000000000000000000003",
  Category: "000000000000000000000004",
  subCategory: "000000000000000000000005",
  location: "000000000000000000000006",
};
const models = [
  { name: "Atlas Air 14", brand: "Demo Atlas", price: 850 },
  { name: "Nova Pro 15", brand: "Demo Nova", price: 1200 },
  { name: "Summit Work 16", brand: "Demo Summit", price: 1450 },
  { name: "Orbit Go 13", brand: "Demo Orbit", price: 650 },
];

function generateAssets({ count = 20, seed = 42, asOf = new Date().toISOString().slice(0, 10), references = previewReferences } = {}) {
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error("Count must be an integer from 1 to 10000.");
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error("Seed must be an unsigned 32-bit integer.");
  const end = new Date(`${asOf}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(end.getTime()) || end.toISOString().slice(0, 10) !== asOf) throw new Error("as-of must be a valid YYYY-MM-DD date.");
  const yearStart = Date.UTC(end.getUTCFullYear(), 0, 1);
  const availableDays = Math.floor((end.getTime() - yearStart) / 86400000) + 1;
  for (const key of Object.keys(previewReferences)) {
    if (!/^[a-f0-9]{24}$/i.test(references[key] || "")) throw new Error(`Provide a valid ObjectId for ${key}.`);
  }
  let state = seed;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const addMonths = (date, months) => {
    const result = new Date(date);
    result.setUTCMonth(result.getUTCMonth() + months);
    return result.toISOString();
  };
  return Array.from({ length: count }, (_, index) => {
    const model = models[Math.floor(random() * models.length)];
    const purchase = new Date(yearStart + Math.floor(random() * availableDays) * 86400000);
    const rental = index % 5 === 4;
    const damaged = index % 10 === 8;
    const maintenance = index % 10 === 9;
    const id = `DEMO-ASSET-${seed}-${String(index + 1).padStart(5, "0")}`;
    const asset = {
      ...Object.fromEntries(Object.keys(previewReferences).map(key => [key, references[key]])),
      assetId: id, departmentAssetId: id, secondaryId: id,
      name: `${model.name} - ${String(index + 1).padStart(3, "0")}`,
      serialNumber: `SN-${id}`, description: "Synthetic demo laptop. Price is USD.",
      assetType: "Physical", tangable: true,
      ownershipType: rental ? "Rental" : "Owned",
      purchaseDate: purchase.toISOString(),
      price: Math.round(model.price * (0.9 + random() * 0.2) * 100) / 100,
      warranty: 24, warrantyExpiryDate: addMonths(purchase, 24),
      rentedMonths: rental ? 36 : 0,
      ...(rental ? { rentedExpirationDate: addMonths(purchase, 36) } : {}),
      brand: model.brand, status: damaged || maintenance ? "Inactive" : "Active",
      isDamaged: damaged, isUnderMaintenance: maintenance,
      isAssigned: false, isExtra: false,
    };
    const error = new Asset(asset).validateSync();
    if (error) throw error;
    return asset;
  });
}

function main() {
  const { values } = parseArgs({ options: {
    count: { type: "string", default: "20" }, seed: { type: "string", default: "42" },
    "as-of": { type: "string", default: new Date().toISOString().slice(0, 10) },
    refs: { type: "string" }, out: { type: "string", default: "demo-assets.preview.json" },
  } });
  const references = values.refs ? JSON.parse(fs.readFileSync(values.refs, "utf8")) : previewReferences;
  const assets = generateAssets({ count: Number(values.count), seed: Number(values.seed), asOf: values["as-of"], references });
  const output = path.resolve(values.out);
  // Exclusive creation prevents accidentally overwriting a previous dataset.
  fs.writeFileSync(output, JSON.stringify({
    previewOnly: !values.refs, currency: "USD", seed: Number(values.seed), asOf: values["as-of"],
    note: "References must be verified in the target database before insertion. This file is a preview envelope, not a mongoimport file.",
    assets,
  }, null, 2) + "\n", { flag: "wx" });
  console.table(assets.slice(0, 6).map(a => ({ name: a.name, priceUSD: a.price, ownership: a.ownershipType, status: a.status })));
  console.log(`Generated and schema-validated ${assets.length} assets: ${output}`);
  console.log("No database connection or writes were performed.");
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { generateAssets, previewReferences };
