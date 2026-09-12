const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const Budget = require('../models/budget/Budget');
const { build } = require('./buildFutureBudgetUpload');
function validate(source) {
  const expected = new Map(build().rows.map(row => [String(row._id), row]));
  if (source.length !== 144 || new Set(source.map(r => String(r._id))).size !== 144) throw new Error('Expected 144 distinct forecast budgets');
  for (const row of source) {
    const reference = expected.get(String(row._id));
    if (!reference || EJSON.stringify(row) !== EJSON.stringify(reference)) throw new Error('Forecast file differs from validated scenario; regenerate it');
    const error = new Budget(row).validateSync(); if (error) throw error;
  }
}
async function main() {
  const { values } = require('node:util').parseArgs({ options: { db: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const uri = process.env.DB_URL;
  if (!uri || values.db !== 'WonoDemoUserData' || new URL(uri).hostname.toLowerCase() !== 'cluster0.d9cnr.mongodb.net') throw new Error('Use the target DB_URL and --db WonoDemoUserData');
  const source = EJSON.parse(fs.readFileSync(path.resolve(__dirname, '../future-budget-upload/budgets.json'), 'utf8'));
  validate(source);
  const company = source[0].company;
  await mongoose.connect(uri, { dbName: values.db, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  async function prepare(session) {
    if (!await db.collection('companies').findOne({ _id: company }, { session })) throw new Error('Company missing');
    for (const key of ['department', 'unit']) {
      const ids = [...new Map(source.map(r => [String(r[key]), r[key]])).values()];
      const count = await db.collection(key === 'department' ? 'departments' : 'units').countDocuments({ _id: { $in: ids }, ...(key === 'unit' ? { company } : {}) }, { session });
      if (count !== ids.length) throw new Error('Missing company budget ' + key + ' references');
    }
    const collisions = await db.collection('budgets').find({ _id: { $in: source.map(r => r._id) } }, { session }).toArray();
    if (collisions.some(r => String(r.company) !== String(company))) throw new Error('Budget ID belongs to another company');
    const existingIds = new Set(collisions.map(r => String(r._id)));
    const rows = source.filter(r => !existingIds.has(String(r._id)));
    const summary = [];
    for (const month of [...new Set(source.map(r => r.month.toISOString().slice(0,7)))]) {
      const start = new Date(`${month}-01T00:00:00Z`), end = new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,1));
      const existing = await db.collection('budgets').find({ company, dueDate: { $gte:start, $lt:end } }, {session}).toArray();
      const pending = rows.filter(r => r.month.toISOString().startsWith(month));
      if (pending.some(row => existing.some(old => String(old.department) === String(row.department) && old.expanseName === row.expanseName))) throw new Error(`Existing expense lines overlap ${month}; no records inserted. Review existing budgets before importing.`);
      const existingBudget = existing.reduce((n,r) => n + Math.max(Number(r.projectedAmount || 0), Number(r.actualAmount || 0)),0);
      const added = pending.reduce((n,r) => n+r.projectedAmount,0);
      // This is the prior generated revenue scenario, not a forecast of actual sales.
      if (pending.length && existingBudget + added >= 187114) throw new Error(`Combined ${month} budgets exceed the USD 187,114 scenario reference; review existing allocations.`);
      summary.push({month, existingBudget, newProjectedUSD:added, entries:pending.length});
    }
    return {rows,summary};
  }
  const preview = await prepare(); console.table(preview.summary);
  console.log(`${source.length - preview.rows.length} previously imported entries skipped.`);
  if (!values.apply) { console.log('Preflight passed. No writes. Add --apply to insert illustrative forecast budgets.'); return; }
  const session = await mongoose.startSession();
  try {
    let inserted = 0;
    await session.withTransaction(async () => {
      const {rows} = await prepare(session);
      if (rows.length) {
        const result = await db.collection('budgets').bulkWrite(rows.map(row => ({updateOne:{filter:{_id:row._id,company},update:{$setOnInsert:row},upsert:true}})),{session});
        inserted = result.upsertedCount;
      }
    });
    console.log(`Inserted ${inserted} projected-only budgets into WonoDemoUserData. Existing records preserved.`);
  } finally { await session.endSession(); }
}
if (require.main === module) main().catch(e => { console.error(String(e.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g,'[redacted URI]')); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { validate };
