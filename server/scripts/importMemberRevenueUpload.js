const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const mongoose = require('mongoose');
const { build, models } = require('./buildMemberRevenueUpload');
async function main() {
  const { values } = parseArgs({ options: { dir: { type: 'string', default: 'member-revenue-upload' }, db: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const uri = process.env.DB_URL;
  if (!uri || values.db !== 'WonoDemoUserData' || new URL(uri).hostname.toLowerCase() !== 'cluster0.d9cnr.mongodb.net') throw new Error('Use the target DB_URL and --db WonoDemoUserData');
  const manifest = JSON.parse(fs.readFileSync(path.join(values.dir, 'manifest.json'), 'utf8'));
  const company = new mongoose.Types.ObjectId(manifest.company);
  await mongoose.connect(uri, { dbName: values.db, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  async function prepare(session) {
    if (!await db.collection('companies').findOne({ _id: company }, { session })) throw new Error('Missing target company');
    const clients = {};
    for (const [key, ids] of Object.entries(manifest.clientIds)) {
      const filter = { _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) }, ...(key === 'workationclients' ? {} : { company }) };
      const rows = await db.collection(key).find(filter, { session }).toArray();
      if (rows.length !== ids.length) throw new Error('Missing referenced clients in ' + key + '. Import the sales bundle first.');
      clients[key] = ids.map(id => rows.find(r => String(r._id) === id));
    }
    for (const client of [...clients.coworkingclients, ...clients.virtualofficeclients]) {
      if (!await db.collection('units').findOne({ _id: client.unit, company }, { session })) throw new Error('Missing client unit or wrong company: ' + client.clientName);
      if (!await db.collection('clientservices').findOne({ _id: client.service, company }, { session })) throw new Error('Missing client service or wrong company: ' + client.clientName);
    }
    const result = build({ clients, company, through: manifest.through });
    for (const client of clients.coworkingclients) {
      const generated = result.data.coworkingmembers.filter(m => String(m.client) === String(client._id));
      const existing = await db.collection('coworkingmembers').find({ client: client._id, company }, { session }).toArray();
      const existingIds = new Set(existing.map(m => String(m._id)));
      const active = existing.filter(m => m.isActive !== false && !m.isDeleted).length;
      const additions = generated.filter(m => !existingIds.has(String(m._id))).length;
      const booked = Number(client.openDesks || 0) + Number(client.cabinDesks || 0);
      if (active + additions > booked) throw new Error(`Member capacity exceeded for ${client.clientName}: ${active} existing + ${additions} new / ${booked} desks. No records inserted.`);
      for (const member of generated) {
        if (await db.collection('coworkingmembers').findOne({ email: member.email, _id: { $ne: member._id } }, { session })) throw new Error('Member email already exists: ' + member.email);
      }
    }
    // Avoid adding a second monthly revenue entry for the same client.
    for (const [key, clientField, dateField] of [['coworkingclientrevenues', 'clients', 'rentDate'], ['virtualofficerevenues', 'client', 'rentDate'], ['workationrevenues', 'client', 'date']]) {
      const pending = [];
      for (const row of result.data[key]) {
        const date = row[dateField], start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)), end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
        if (!await db.collection(key).findOne({ company, [clientField]: row[clientField], [dateField]: { $gte: start, $lt: end } }, { session })) pending.push(row);
      }
      result.data[key] = pending;
    }
    return result;
  }
  const preview = await prepare();
  console.table(preview.teamSizes);
  console.table(Object.entries(preview.data).map(([collection, rows]) => ({ collection, records: rows.length })));
  if (!values.apply) { console.log('Preflight passed. No writes. Add --apply to import.'); return; }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { data } = await prepare(session);
      for (const [key, Model] of Object.entries(models)) if (data[key].length) await db.collection(Model.collection.name).bulkWrite(data[key].map(row => ({ updateOne: { filter: { _id: row._id }, update: { $setOnInsert: row }, upsert: true } })), { session });
    });
    console.log('Members and revenue imported into WonoDemoUserData. Existing records preserved.');
  } finally { await session.endSession(); }
}
if (require.main === module) main().catch(e => { console.error(String(e.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted URI]')); process.exitCode = 1; }).finally(() => mongoose.disconnect());
