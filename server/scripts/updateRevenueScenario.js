const fs = require('node:fs');
const { parseArgs } = require('node:util');
const { EJSON } = require('bson');
const mongoose = require('mongoose');
const { build, models } = require('./buildMemberRevenueUpload');
async function main() {
  const { values } = parseArgs({ options: { db: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const uri = process.env.DB_URL;
  if (!uri || values.db !== 'WonoDemoUserData' || new URL(uri).hostname.toLowerCase() !== 'cluster0.d9cnr.mongodb.net') throw new Error('Use the target DB_URL and --db WonoDemoUserData');
  const manifest = JSON.parse(fs.readFileSync('member-revenue-upload/manifest.json', 'utf8'));
  const company = new mongoose.Types.ObjectId(manifest.company);
  await mongoose.connect(uri, { dbName: values.db, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  async function prepare(session) {
    const clients = {};
    for (const [key, ids] of Object.entries(manifest.clientIds)) {
      const rows = await db.collection(key).find({ _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) }, ...(key === 'workationclients' ? {} : { company }) }, { session }).toArray();
      if (rows.length !== ids.length) throw new Error('Missing clients in ' + key);
      clients[key] = ids.map(id => rows.find(r => String(r._id) === id));
    }
    const result = build({ clients, company, through: manifest.through });
    delete result.data.coworkingmembers;
    for (const [key, rows] of Object.entries(result.data)) {
      for (const row of rows) {
        const existing = await db.collection(key).findOne({ _id: row._id }, { session });
        if (existing && String(existing.company) !== String(company)) throw new Error('Revenue ID belongs to another company');
      }
    }
    return result;
  }
  const preview = await prepare();
  const summary = {};
  for (const [key, rows] of Object.entries(preview.data)) for (const row of rows) {
    const date = row.rentDate || row.date || row.invoiceCreationDate;
    const month = date.toISOString().slice(0, 7);
    summary[month] ||= { month };
    // Chart-compatible revenue measure (gross where the revenue service uses gross).
    summary[month][key] = Math.round(((summary[month][key] || 0) + Number(row.revenue ?? row.taxableAmount)) * 100) / 100;
  }
  console.table(Object.values(summary).sort((a, b) => a.month.localeCompare(b.month)));
  console.log('Also updates the 18 referenced coworking client desk rates to match their invoices. Desk counts, units, members and meeting revenue are unchanged.');
  if (!values.apply) { console.log('Preview only. Add --apply to update the USD revenue scenario.'); return; }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const result = await prepare(session);
      for (const rates of result.clientRateUpdates) {
        const { _id, company: ignored, ...fields } = rates;
        await db.collection('coworkingclients').updateOne({ _id, company }, { $set: fields }, { session });
      }
      for (const [key, rows] of Object.entries(result.data)) if (rows.length) await db.collection(models[key].collection.name).bulkWrite(rows.map(row => {
        const editable = { coworkingclientrevenues: ['noOfDesks', 'deskRate', 'revenue'], virtualofficerevenues: ['taxableAmount', 'revenue', 'rentStatus'], workationrevenues: ['particulars', 'taxableAmount', 'gst', 'totalAmount'], alternaterevenues: ['particulars', 'taxableAmount', 'gst', 'invoiceAmount'] }[key];
        const { _id, ...fields } = row;
        const changes = Object.fromEntries(editable.map(k => [k, fields[k]]));
        for (const k of editable) delete fields[k];
        return { updateOne: { filter: { _id, company }, update: { $set: changes, $setOnInsert: fields }, upsert: true } };
      }), { session });
    });
    console.log('Revenue scenario updated in WonoDemoUserData. No other database was changed.');
  } finally { await session.endSession(); }
}
if (require.main === module) main().catch(e => { console.error(String(e.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted URI]')); process.exitCode = 1; }).finally(() => mongoose.disconnect());
