const fs = require('node:fs');
const path = require('node:path');
const { EJSON } = require('bson');
const mongoose = require('mongoose');
const { models } = require('./buildPipelineUpload');
async function main() {
  const { values } = require('node:util').parseArgs({ options: { db: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const uri = process.env.DB_URL;
  if (!uri || values.db !== 'WonoDemoUserData' || new URL(uri).hostname.toLowerCase() !== 'cluster0.d9cnr.mongodb.net') throw new Error('Use target DB_URL and --db WonoDemoUserData');
  const data = Object.fromEntries(Object.keys(models).map(k => [k, EJSON.parse(fs.readFileSync(path.join('pipeline-upload', k + '.json'), 'utf8'))]));
  const company = data.leads[0].company;
  for (const [key, Model] of Object.entries(models)) for (const row of data[key]) {
    const error = new Model(row).validateSync(); if (error) throw error;
    if (String(row.company || row.companyData) !== String(company)) throw new Error('Mixed company references');
  }
  await mongoose.connect(uri, { dbName: values.db, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  async function preflight(session) {
    if (!await db.collection('companies').findOne({ _id: company }, { session })) throw new Error('Company missing');
    for (const [collection, references, scoped] of [
      ['clientservices', data.leads.map(r => r.serviceCategory), true],
      ['units', data.leads.flatMap(r => r.proposedLocations), true],
      ['departments', data.vendors.map(r => r.departmentId), false],
    ]) {
      const ids = [...new Map(references.map(r => [String(r), r])).values()];
      if (await db.collection(collection).countDocuments({ _id: { $in: ids }, ...(scoped ? { company } : {}) }, { session }) !== ids.length) throw new Error('Missing or mismatched references in ' + collection);
    }
    for (const [key, fields] of [['leads', ['companyName', 'emailAddress']], ['vendors', ['email']], ['jobapplications', ['email']]]) {
      const rows = data[key];
      for (const field of fields) {
        const values = rows.map(r => r[field]);
        if (new Set(values).size !== values.length) throw new Error(`Duplicate ${field} in ${key} upload`);
        const existing = await db.collection(models[key].collection.name).find({ [field]: { $in: values } }, { session }).toArray();
        for (const row of existing) {
          const desired = rows.find(r => r[field] === row[field]);
          if (String(row._id) !== String(desired._id) || String(row.company || row.companyData) !== String(company)) throw new Error(`Existing ${key} record conflicts on ${field}: ${row[field]}`);
        }
      }
    }
  }
  await preflight();
  console.table(Object.entries(data).map(([collection, rows]) => ({ collection, records: rows.length })));
  if (!values.apply) { console.log('Preflight passed. No writes. Add --apply to import.'); return; }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await preflight(session);
      for (const [key, Model] of Object.entries(models)) await db.collection(Model.collection.name).bulkWrite(data[key].map(row => ({ updateOne: { filter: { _id: row._id, [key === 'jobapplications' ? 'companyData' : 'company']: company }, update: { $setOnInsert: row }, upsert: true } })), { session });
    });
    console.log('Leads, job applications and vendors imported into WonoDemoUserData. Existing records preserved.');
  } finally { await session.endSession(); }
}
if (require.main === module) main().catch(e => { console.error(String(e.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted URI]')); process.exitCode = 1; }).finally(() => mongoose.disconnect());
