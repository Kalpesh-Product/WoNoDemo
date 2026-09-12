const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const { cleanRecord, fields } = require('./removeDemoLabels');
const { presentation } = require('./activityPresentation');
async function main() {
  const { values } = parseArgs({ options: { db: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const uri = process.env.DB_URL;
  if (!uri || values.db !== 'WonoDemoUserData' || new URL(uri).hostname.toLowerCase() !== 'cluster0.d9cnr.mongodb.net') throw new Error('Use the configured DB_URL and --db WonoDemoUserData');
  const groups = [['demo-upload', require('./buildDemoUpload').models], ['activity-upload', require('./buildActivityUpload').models]];
  const plans = [];
  for (const [dir, models] of groups) {
    const data = Object.fromEntries(Object.keys(models).map(k => [k, EJSON.parse(fs.readFileSync(path.join(dir, k + '.json'), 'utf8'))]));
    if (data.rooms) presentation(data);
    for (const [key, Model] of Object.entries(models)) plans.push({ collection: Model.collection.name, key, records: data[key] });
  }
  await mongoose.connect(uri, { dbName: values.db, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
  async function update(session) {
    const summary = [];
    for (const plan of plans) {
      const collection = mongoose.connection.db.collection(plan.collection);
      const live = await collection.find({ _id: { $in: plan.records.map(r => r._id) } }, { session }).toArray();
      if (live.length !== plan.records.length) throw new Error('Missing imported records in ' + plan.collection);
      const desired = new Map(plan.records.map(r => [String(r._id), r]));
      const operations = [];
      for (const record of live) {
        const target = desired.get(String(record._id));
        const cleaned = cleanRecord(record);
        const changes = Object.fromEntries(fields.filter(f => cleaned[f] !== record[f]).map(f => [f, cleaned[f]]));
        if (plan.key === 'rooms' && record.name !== target.name) changes.name = target.name;
        if (['visitors', 'externalvisits'].includes(plan.key)) {
          const client = ['Meeting', 'Full-Day Pass', 'Half-Day Pass'].includes(record.visitorType);
          if (client) {
            if (record.visitorFlag !== 'Client') changes.visitorFlag = 'Client';
            if (!record.visitorRoles?.includes('Client')) changes.visitorRoles = [...new Set([...(record.visitorRoles || []), 'Client'])];
            if (plan.key === 'visitors') for (const f of ['registeredClientCompany', 'brandName']) if (!record[f]) changes[f] = record.visitorCompany || target[f];
          }
          if (plan.key === 'visitors' && record.idProof?.idType === 'Synthetic reference') changes['idProof.idType'] = 'Reference';
        }
        if (Object.keys(changes).length) operations.push({ updateOne: { filter: { _id: record._id }, update: { $set: changes } } });
      }
      summary.push({ collection: plan.collection, updates: operations.length });
      if (values.apply && operations.length) await collection.bulkWrite(operations, { session });
    }
    return summary;
  }
  const session = await mongoose.startSession();
  try {
    let summary;
    if (values.apply) await session.withTransaction(async () => { summary = await update(session); });
    else summary = await update();
    console.table(summary);
    console.log(values.apply ? 'Names and external-client classification updated.' : 'Preview only. Add --apply to update.');
  } finally { await session.endSession(); }
}
if (require.main === module) main().catch(e => { console.error(String(e.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted URI]')); process.exitCode = 1; }).finally(() => mongoose.disconnect());
