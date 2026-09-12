const fs = require('node:fs');
const { EJSON } = require('bson');
const mongoose = require('mongoose');
const Budget = require('../models/budget/Budget');
async function main() {
  const { values } = require('node:util').parseArgs({ options: { db: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const uri = process.env.DB_URL;
  if (!uri || values.db !== 'WonoDemoUserData' || new URL(uri).hostname.toLowerCase() !== 'cluster0.d9cnr.mongodb.net') throw new Error('Use the target DB_URL and --db WonoDemoUserData');
  const source = EJSON.parse(fs.readFileSync('budget-upload/budgets.json', 'utf8'));
  const company = source[0].company;
  await mongoose.connect(uri, { dbName: values.db, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  async function prepare(session) {
    const rows = [], summary = [];
    for (const row of source) {
      if (String(row.company) !== String(company)) throw new Error('Company mismatch in budget file');
      const error = new Budget(row).validateSync(); if (error) throw error;
    }
    if (!await db.collection('companies').findOne({ _id: company }, { session })) throw new Error('Company missing');
    for (const key of ['department', 'unit']) {
      const ids = [...new Map(source.map(r => [String(r[key]), r[key]])).values()];
      const found = await db.collection(key === 'department' ? 'departments' : 'units').countDocuments({ _id: { $in: ids }, ...(key === 'unit' ? { company } : {}) }, { session });
      if (found !== ids.length) throw new Error('Missing budget ' + key + ' references');
    }
    for (const month of [...new Set(source.map(r => r.month.toISOString().slice(0, 7)))]) {
      const start = new Date(`${month}-01T00:00:00Z`), end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      let revenue = 0;
      for (const [collection, date, amount] of [['coworkingclientrevenues', 'rentDate', 'revenue'], ['virtualofficerevenues', 'rentDate', 'revenue'], ['workationrevenues', 'date', 'taxableAmount'], ['alternaterevenues', 'invoiceCreationDate', 'taxableAmount']]) {
        const totals = await db.collection(collection).aggregate([{ $match: { company, [date]: { $gte: start, $lt: end } } }, { $group: { _id: null, total: { $sum: '$' + amount } } }], { session }).toArray();
        revenue += Number(totals[0]?.total || 0);
      }
      if (!(revenue > 0)) throw new Error('No live revenue in ' + month + '. Import revenue first.');
      const existing = await db.collection('budgets').find({ company, dueDate: { $gte: start, $lt: end } }, { session }).toArray();
      const existingIds = new Set(existing.map(r => String(r._id)));
      const existingTotal = existing.reduce((sum, r) => sum + Math.max(Number(r.projectedAmount || 0), Number(r.actualAmount || 0), (r.particulars || []).reduce((n, p) => n + Number(p.particularAmount || 0), 0)), 0);
      const pending = source.filter(r => r.month.toISOString().startsWith(month) && !existingIds.has(String(r._id)));
      const available = Math.floor((revenue * 0.6 - existingTotal) * 100) / 100;
      if (pending.length && available <= 0) throw new Error(`Existing budgets already consume 60% of ${month} revenue. No budgets added.`);
      const requested = pending.reduce((sum, r) => sum + r.projectedAmount, 0);
      const factor = requested ? Math.min(1, available / requested) : 1;
      let added = 0;
      for (const record of pending) {
        const projectedAmount = Math.floor(record.projectedAmount * factor * 100) / 100;
        const actualAmount = Math.floor(record.actualAmount * factor * 100) / 100;
        if (projectedAmount <= 0) throw new Error('Remaining budget too small for meaningful entries');
        rows.push({ ...record, projectedAmount, actualAmount, particulars: record.particulars.map(p => ({ ...p, particularAmount: projectedAmount })) });
        added += projectedAmount;
      }
      if (existingTotal + added >= revenue) throw new Error('Combined budgets would exceed revenue in ' + month);
      summary.push({ month, revenue, existingBudget: existingTotal, newBudget: Math.round(added * 100) / 100, combined: Math.round((existingTotal + added) * 100) / 100 });
    }
    return { rows, summary };
  }
  const preview = await prepare(); console.table(preview.summary);
  if (!values.apply) { console.log('Preflight passed. No writes. Add --apply to insert budgets.'); return; }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { rows } = await prepare(session);
      if (rows.length) await db.collection('budgets').bulkWrite(rows.map(row => ({ updateOne: { filter: { _id: row._id, company }, update: { $setOnInsert: row }, upsert: true } })), { session });
    });
    console.log('Budgets imported into WonoDemoUserData. Existing budgets preserved.');
  } finally { await session.endSession(); }
}
if (require.main === module) main().catch(e => { console.error(String(e.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted URI]')); process.exitCode = 1; }).finally(() => mongoose.disconnect());
