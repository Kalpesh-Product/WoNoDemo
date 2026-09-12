const fs = require('node:fs');
const path = require('node:path');
const { EJSON } = require('bson');
const mongoose = require('mongoose');
const { models } = require('./buildPerformanceUpload');
async function main() {
  const { values } = require('node:util').parseArgs({ options: { db: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const uri = process.env.DB_URL;
  if (!uri || values.db !== 'WonoDemoUserData' || new URL(uri).hostname.toLowerCase() !== 'cluster0.d9cnr.mongodb.net') throw new Error('Use target DB_URL and --db WonoDemoUserData');
  const data = Object.fromEntries(Object.keys(models).map(k => [k, EJSON.parse(fs.readFileSync(path.join('performance-upload', k + '.json'), 'utf8'))]));
  const company = data.tasks[0].company;
  for (const [key, Model] of Object.entries(models)) for (const row of data[key]) { const error = new Model(row).validateSync(); if (error) throw error; if (String(row.company) !== String(company)) throw new Error('Mixed company references'); }
  for (const completion of data.krakpatasks) {
    const role = data.krakparoles.find(r => String(r._id) === String(completion.task));
    if (!role || String(role.assignTo) !== String(completion.completedBy) || !role.completedDate.some(d => +d === +completion.completionDate)) throw new Error('Invalid performance completion link');
  }
  await mongoose.connect(uri, { dbName: values.db, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  async function preflight(session) {
    if (!await db.collection('companies').findOne({ _id: company }, { session })) throw new Error('Missing company');
    const users = await db.collection('userdatas').find({ company }, { session }).toArray();
    const roles = await db.collection('roles').find({}, { session }).toArray();
    const departments = await db.collection('departments').find({}, { session }).toArray();
    const units = await db.collection('units').find({ company }, { session }).toArray();
    for (const row of [...data.tasks, ...data.krakparoles]) {
      if (!departments.some(d => String(d._id) === String(row.department))) throw new Error('Missing department');
      const owners = row.assignedTo || [row.assignTo];
      for (const person of [...owners, row.assignedBy]) {
        const user = users.find(u => String(u._id) === String(person));
        if (!user || !user.departments.some(d => String(d) === String(row.department))) throw new Error('User missing or not in assigned department');
        if (row.assignTo && String(person) === String(row.assignTo) && !user.role.some(r => String(r) === String(row.role))) throw new Error('User role no longer matches performance assignment');
      }
      if (row.role && !roles.some(r => String(r._id) === String(row.role))) throw new Error('Missing performance role');
      if (row.location && !units.some(u => String(u._id) === String(row.location))) throw new Error('Missing task location');
    }
  }
  await preflight();
  console.table(Object.entries(data).map(([collection, rows]) => ({ collection, records: rows.length })));
  if (!values.apply) { console.log('Preflight passed. No writes. Add --apply to import.'); return; }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await preflight(session);
      for (const [key, Model] of Object.entries(models)) {
        if (data[key].length) await db.collection(Model.collection.name).bulkWrite(data[key].map(row => ({ updateOne: { filter: { _id: row._id, company }, update: { $setOnInsert: row }, upsert: true } })), { session });
      }
    });
    console.log('Tasks and performance imported into WonoDemoUserData. Existing records preserved.');
  } finally { await session.endSession(); }
}
if (require.main === module) main().catch(e => { console.error(String(e.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted URI]')); process.exitCode = 1; }).finally(() => mongoose.disconnect());
