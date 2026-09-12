const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const fields = ['name', 'categoryName', 'subCategoryName', 'roleTitle', 'roleID', 'empId', 'email', 'assetId', 'departmentAssetId', 'secondaryId', 'serialNumber', 'brand', 'description', 'designation', 'jobDescription'];
function cleanRecord(record) {
  const result = { ...record };
  for (const field of fields) {
    if (typeof result[field] !== 'string') continue;
    result[field] = result[field]
      .replace(/\b(?:demo|dummy|synthetic)[ ._-]*/gi, '')
      .replace(/ {2,}/g, ' ').trim();
  }
  return result;
}

async function main() {
  const { values } = parseArgs({ options: { dir: { type: 'string', default: 'demo-upload' }, db: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const uri = process.env.DB_URL;
  if (!uri || values.db !== 'WonoDemoUserData') throw new Error('Set DB_URL and use --db WonoDemoUserData.');
  if (new URL(uri).hostname.toLowerCase() !== 'cluster0.d9cnr.mongodb.net') throw new Error('Unexpected target cluster.');
  const { models } = require('./buildDemoUpload');
  const ids = Object.fromEntries(Object.keys(models).map(key => [key, EJSON.parse(fs.readFileSync(path.join(values.dir, key + '.json'), 'utf8')).map(r => r._id)]));
  await mongoose.connect(uri, { dbName: values.db, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 15000 });
  const session = await mongoose.startSession();
  const execute = async (session) => {
    const summary = [];
    for (const [key, Model] of Object.entries(models)) {
      const collection = mongoose.connection.db.collection(Model.collection.name);
      const records = await collection.find({ _id: { $in: ids[key] } }, { session }).toArray();
      if (records.length !== ids[key].length) throw new Error(`Missing imported records in ${key}. No updates committed.`);
      const operations = [];
      for (const record of records) {
        const cleaned = cleanRecord(record);
        const changed = Object.fromEntries(fields.filter(f => record[f] !== cleaned[f]).map(f => [f, cleaned[f]]));
        if (Object.keys(changed).length) operations.push({ updateOne: { filter: { _id: record._id }, update: { $set: changed } } });
      }
      summary.push({ collection: key, recordsToUpdate: operations.length });
      if (values.apply && operations.length) await collection.bulkWrite(operations, { session });
    }
    return summary;
  };
  try {
    let summary;
    if (values.apply) await session.withTransaction(async () => { summary = await execute(session); });
    else summary = await execute();
    console.table(summary);
    console.log(values.apply ? 'Labels updated. ObjectIds and relationships preserved.' : 'Preview only. Add --apply to update.');
  } finally { await session.endSession(); }
}
if (require.main === module) main().catch(error => { console.error(String(error.message).replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted URI]')); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { cleanRecord, fields };
