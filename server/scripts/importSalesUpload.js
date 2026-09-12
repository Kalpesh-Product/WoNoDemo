const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const { models, revenueFor } = require('./buildSalesUpload');
const { allocateClientDesks } = require('./allocateClientDesks');
async function main() {
  const { values } = parseArgs({ options: { dir: { type: 'string', default: 'sales-upload' }, db: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const uri = process.env.DB_URL;
  if (!uri || values.db !== 'WonoDemoUserData' || new URL(uri).hostname.toLowerCase() !== 'cluster0.d9cnr.mongodb.net') throw new Error('Use the target DB_URL and --db WonoDemoUserData');
  const data = Object.fromEntries(Object.keys(models).map(k => [k, EJSON.parse(fs.readFileSync(path.join(values.dir, k + '.json'), 'utf8'))]));
  const manifest = JSON.parse(fs.readFileSync(path.join(values.dir, 'manifest.json'), 'utf8'));
  const companyId = new mongoose.Types.ObjectId(manifest.company);
  for (const [key, Model] of Object.entries(models)) for (const row of data[key]) {
    const error = new Model(row).validateSync(); if (error) throw error;
    if (key !== 'workationclients' && String(row.company) !== manifest.company) throw new Error('Bundle company mismatch');
  }
  await mongoose.connect(uri, { dbName: values.db, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  async function prepare(session) {
    if (!await db.collection('companies').findOne({ _id: companyId }, { session })) throw new Error('Company missing in target');
    const prepared = Object.fromEntries(Object.entries(data).map(([k, rows]) => [k, rows.map(r => ({ ...r }))]));
    const serviceMap = new Map();
    prepared.clientservices = [];
    for (const service of data.clientservices) {
      const existing = await db.collection('clientservices').findOne({ _id: service._id, company: companyId, serviceName: service.serviceName }, { session });
      if (!existing) throw new Error(`Required service from supplied CSV is missing or mismatched: ${service.serviceName} (${service._id}).`);
      if (existing.isActive === false) throw new Error('Required service is inactive: ' + service.serviceName);
      serviceMap.set(String(service._id), service._id);
    }
    const units = new Map();
    for (const key of ['coworkingclients', 'virtualofficeclients']) for (const client of prepared[key]) {
      const service = serviceMap.get(String(client.service)); if (!service) throw new Error('Missing client service'); client.service = service;
      let unit = units.get(String(client.unit));
      if (!unit) { unit = await db.collection('units').findOne({ _id: client.unit, company: companyId }, { session }); if (!unit) throw new Error('Missing client unit or wrong company'); units.set(String(unit._id), unit); }
      if (client.building && (String(unit.building) !== String(client.building) || !await db.collection('buildings').findOne({ _id: client.building }, { session }))) throw new Error('Missing or inconsistent building for unit ' + unit.unitNo);
      const existingEmail = await db.collection(models[key].collection.name).findOne({ email: client.email, _id: { $ne: client._id } }, { session });
      if (existingEmail) throw new Error('Email already used by another client: ' + client.email);
    }
    const existingClients = await db.collection('coworkingclients').find({ company: companyId }, { session }).toArray();
    const allocation = allocateClientDesks(prepared.coworkingclients, [...units.values()], existingClients);
    prepared.coworkingclients = allocation.clients;
    for (const client of prepared.coworkingclients) {
      const error = new models.coworkingclients(client).validateSync(); if (error) throw error;
      if (client.building && !await db.collection('buildings').findOne({ _id: client.building }, { session })) throw new Error('Missing building for allocated client ' + client.clientName);
    }
    prepared.meetingclientrevenues = [];
    let existingRevenueCount = 0;
    for (const row of data.meetingclientrevenues) {
      const meeting = await db.collection('meetings').findOne({ _id: row.meeting, company: companyId }, { session });
      if (!meeting) throw new Error('Referenced external meeting missing: ' + row.meeting);
      const room = await db.collection('rooms').findOne({ _id: meeting.bookedRoom, company: companyId }, { session });
      const visitor = await db.collection('visitors').findOne({ _id: meeting.externalClient || meeting.externalBookedBy, company: companyId }, { session });
      const refreshed = new models.meetingclientrevenues(revenueFor(meeting, room, visitor));
      const error = refreshed.validateSync(); if (error) throw error;
      const existing = await db.collection('meetingclientrevenues').findOne({ meeting: row.meeting, company: companyId }, { session });
      if (existing) { existingRevenueCount++; continue; }
      prepared.meetingclientrevenues.push(refreshed.toObject({ versionKey: false }));
    }
    return { prepared, existingRevenueCount, allocationChanges: allocation.changes };
  }
  const preview = await prepare();
  if (preview.allocationChanges.length) { console.log('Desk allocations adjusted to remaining live unit capacity:'); console.table(preview.allocationChanges); }
  console.table(Object.entries(preview.prepared).map(([collection, rows]) => ({ collection, records: rows.length })));
  console.log(`${preview.existingRevenueCount} existing meeting-revenue entries skipped; ${preview.prepared.meetingclientrevenues.length} new revenue entries to insert.`);
  if (!values.apply) { console.log('Preflight passed. No writes. Add --apply to import.'); return; }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { prepared } = await prepare(session);
      for (const [key, Model] of Object.entries(models)) if (prepared[key].length) await db.collection(Model.collection.name).bulkWrite(prepared[key].map(row => ({ updateOne: { filter: key === 'meetingclientrevenues' ? { company: row.company, meeting: row.meeting } : { _id: row._id }, update: { $setOnInsert: row }, upsert: true } })), { session });
    });
    console.log('Sales records imported into WonoDemoUserData. Existing records preserved.');
  } finally { await session.endSession(); }
}
if (require.main === module) main().catch(e => { console.error(String(e.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted URI]')); process.exitCode = 1; }).finally(() => mongoose.disconnect());
