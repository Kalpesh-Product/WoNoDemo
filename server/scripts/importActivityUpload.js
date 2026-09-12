const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const { models } = require('./buildActivityUpload');
const collections = { Company: 'companies', Department: 'departments', Unit: 'units', UserData: 'userdatas', Room: 'rooms', Visitor: 'visitors', Meeting: 'meetings', Ticket: 'tickets' };
function missingIssues(company, tickets, definitions) {
  const missing = new Map();
  for (const ticket of tickets) {
    const departmentId = String(ticket.raisedToDepartment);
    const department = company?.selectedDepartments?.find(d => String(d.department) === departmentId);
    if (!department) throw new Error('Target company does not include department: ' + departmentId);
    const title = ticket.ticket.toLowerCase();
    if (department.ticketIssues?.some(i => i.title.toLowerCase() === title)) continue;
    const definition = definitions.find(d => String(d.department) === departmentId && d.issue.title.toLowerCase() === title);
    if (!definition || !['High', 'Medium', 'Low'].includes(definition.issue.priority)) throw new Error('Missing source issue definition: ' + ticket.ticket);
    missing.set(departmentId + ':' + title, definition);
  }
  return [...missing.values()];
}
function references(data) {
  const refs = new Map();
  const add = (model, value) => {
    if (!value) return;
    if (!collections[model]) throw new Error('Unsupported reference ' + model);
    refs.set(model + ':' + value, { model, id: value });
  };
  function walk(schema, record) {
    schema.eachPath((key, type) => {
      const value = key.split('.').reduce((v, k) => v?.[k], record);
      const ref = type.options.ref || type.caster?.options.ref;
      if (ref) for (const v of Array.isArray(value) ? value : [value]) add(ref, v);
      if (type.schema && value) for (const v of Array.isArray(value) ? value : [value]) walk(type.schema, v);
    });
  }
  for (const [key, Model] of Object.entries(models)) for (const row of data[key]) {
    const error = new Model(row).validateSync(); if (error) throw error;
    walk(Model.schema, row);
  }
  return [...refs.values()];
}
async function main() {
  const { values } = parseArgs({ options: { dir: { type: 'string', default: 'activity-upload' }, db: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const uri = process.env.DB_URL;
  if (!uri || values.db !== 'WonoDemoUserData') throw new Error('Set DB_URL and use --db WonoDemoUserData');
  if (new URL(uri).hostname.toLowerCase() !== 'cluster0.d9cnr.mongodb.net') throw new Error('Unexpected cluster hostname');
  const data = Object.fromEntries(Object.keys(models).map(k => [k, EJSON.parse(fs.readFileSync(path.join(values.dir, k + '.json'), 'utf8'))]));
  const manifest = JSON.parse(fs.readFileSync(path.join(values.dir, 'manifest.json'), 'utf8'));
  const definitions = EJSON.parse(fs.readFileSync(path.join(values.dir, 'ticketIssues.json'), 'utf8'));
  const refs = references(data);
  const visitorIds = new Map();
  for (const visitor of data.visitors) {
    const number = visitor.idProof?.idNumber;
    if (!number || visitorIds.has(number)) throw new Error('Every visitor needs a unique, nonempty idProof.idNumber. Regenerate the activity bundle.');
    visitorIds.set(number, String(visitor._id));
  }
  const local = new Map(Object.entries(models).map(([key, Model]) => [Model.modelName, new Set(data[key].map(r => String(r._id)))]));
  for (const rows of Object.values(data)) for (const row of rows) if (String(row.company) !== manifest.company) throw new Error('Bundle company mismatch');
  await mongoose.connect(uri, { dbName: values.db, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  async function preflight(session) {
    const conflicts = await db.collection('visitors').find(
      { 'idProof.idNumber': { $in: [...visitorIds.keys()] } },
      { session, projection: { _id: 1, 'idProof.idNumber': 1 } },
    ).toArray();
    for (const visitor of conflicts) if (visitorIds.get(visitor.idProof.idNumber) !== String(visitor._id)) throw new Error('Visitor ID-proof reference is already used by another record: ' + visitor.idProof.idNumber);
    for (const [model, collection] of Object.entries(collections)) {
      const ids = refs.filter(r => r.model === model && !local.get(model)?.has(String(r.id))).map(r => r.id);
      if (!ids.length) continue;
      const filter = { _id: { $in: ids } };
      if (['UserData', 'Unit'].includes(model)) filter.company = new mongoose.Types.ObjectId(manifest.company);
      const found = await db.collection(collection).countDocuments(filter, { session });
      if (found !== ids.length) throw new Error(`Missing ${model} references or company mismatch in target. Import the user bundle first.`);
    }
    const company = await db.collection('companies').findOne({ _id: new mongoose.Types.ObjectId(manifest.company) }, { session });
    return missingIssues(company, data.tickets, definitions);
  }
  const additions = await preflight();
  console.log(`${additions.length} missing ticket issue definitions will be added on --apply. Existing definitions are preserved.`);
  console.table(Object.entries(data).map(([collection, rows]) => ({ collection, records: rows.length })));
  if (!values.apply) { console.log('Preflight passed. No writes. Add --apply to import.'); return; }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const missing = await preflight(session);
      for (const definition of missing) {
        const result = await db.collection('companies').updateOne(
          { _id: new mongoose.Types.ObjectId(manifest.company), 'selectedDepartments.department': definition.department },
          { $addToSet: { 'selectedDepartments.$.ticketIssues': definition.issue } },
          { session },
        );
        if (result.matchedCount !== 1) throw new Error('Could not link ticket issue to target department');
      }
      for (const [key, Model] of Object.entries(models)) if (data[key].length) await db.collection(Model.collection.name).bulkWrite(data[key].map(row => ({ updateOne: { filter: { _id: row._id }, update: { $setOnInsert: row }, upsert: true } })), { session });
    });
    console.log('Activity import committed to WonoDemoUserData. Existing IDs were preserved.');
  } finally { await session.endSession(); }
}
if (require.main === module) main().catch(e => { console.error(String(e.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted URI]')); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { references, missingIssues };
