const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { EJSON } = require('bson');
const mongoose = require('mongoose');
const { models } = require('./buildMemberRevenueUpload');
const { memberContacts } = require('./memberContacts');
async function main() {
  const { values } = parseArgs({ options: { db: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const uri = process.env.DB_URL;
  if (!uri || values.db !== 'WonoDemoUserData' || new URL(uri).hostname.toLowerCase() !== 'cluster0.d9cnr.mongodb.net') throw new Error('Use DB_URL and --db WonoDemoUserData');
  const manifest = JSON.parse(fs.readFileSync('member-revenue-upload/manifest.json', 'utf8'));
  const company = new mongoose.Types.ObjectId(manifest.company);
  const fields = { coworkingmembers: ['email', 'mobileNo'], virtualofficerevenues: ['taxableAmount', 'revenue'], workationrevenues: ['taxableAmount', 'gst', 'totalAmount'], alternaterevenues: ['taxableAmount', 'gst', 'invoiceAmount'] };
  const data = Object.fromEntries(Object.keys(fields).map(k => [k, EJSON.parse(fs.readFileSync(path.join('member-revenue-upload', k + '.json'), 'utf8'))]));
  await mongoose.connect(uri, { dbName: values.db, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  async function run(session) {
    const summary = [];
    for (const [key, records] of Object.entries(data)) {
      const live = await db.collection(key).find({ _id: { $in: records.map(r => r._id) }, company }, { session }).toArray();
      const operations = [];
      for (const row of live) {
        const target = records.find(r => String(r._id) === String(row._id));
        let changes = Object.fromEntries(fields[key].map(f => [f, target[f]]));
        if (key === 'coworkingmembers') {
          const client = await db.collection('coworkingclients').findOne({ _id: row.client, company }, { session });
          if (!client) throw new Error('Missing member client');
          const clientIndex = manifest.clientIds.coworkingclients.indexOf(String(client._id));
          const peers = records.filter(r => String(r.client) === String(row.client));
          changes = memberContacts(row.employeeName, client.clientName, clientIndex * 10 + peers.indexOf(target));
          if (await db.collection(key).findOne({ email: changes.email, _id: { $ne: row._id } }, { session })) throw new Error('Email already in use: ' + changes.email);
        }
        const error = new models[key]({ ...row, ...changes }).validateSync(); if (error) throw error;
        if (Object.keys(changes).some(f => changes[f] !== row[f])) operations.push({ updateOne: { filter: { _id: row._id, company }, update: { $set: changes } } });
      }
      summary.push({ collection: key, matched: live.length, updates: operations.length, notImported: records.length - live.length });
      if (values.apply && operations.length) await db.collection(key).bulkWrite(operations, { session });
    }
    return summary;
  }
  const session = await mongoose.startSession();
  try {
    let summary;
    if (values.apply) await session.withTransaction(async () => { summary = await run(session); });
    else summary = await run();
    console.table(summary); console.log(values.apply ? 'Member contacts and sample revenue amounts updated.' : 'Preview only. Add --apply to update.');
  } finally { await session.endSession(); }
}
if (require.main === module) main().catch(e => { console.error(String(e.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted URI]')); process.exitCode = 1; }).finally(() => mongoose.disconnect());
