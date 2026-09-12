const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EJSON } = require('bson');
const { models } = require('./buildPipelineUpload');
const data = Object.fromEntries(Object.keys(models).map(k => [k, EJSON.parse(fs.readFileSync(path.join(__dirname, '../pipeline-upload', k + '.json'), 'utf8'))]));
test('record counts, schemas, and unique identities', () => {
  assert.equal(data.leads.length, 212); assert.equal(data.jobapplications.length, 30); assert.equal(data.vendors.length, 28);
  for (const [key, Model] of Object.entries(models)) {
    assert.equal(new Set(data[key].map(r => String(r._id))).size, data[key].length);
    for (const row of data[key]) assert.equal(new Model(row).validateSync(), undefined);
  }
  assert.equal(new Set(data.leads.map(r => r.companyName)).size, 212);
  assert.equal(new Set(data.leads.map(r => r.emailAddress)).size, 212);
  assert.equal(new Set(data.jobapplications.map(r => r.name)).size, 30);
  assert.equal(new Set(data.vendors.map(r => r.email)).size, 28);
});
test('lead widgets have diverse services, statuses, sources and monthly volumes', () => {
  assert.equal(new Set(data.leads.map(r => r.leadStatus)).size, 4);
  assert.equal(new Set(data.leads.map(r => String(r.serviceCategory))).size, 4);
  assert.equal(new Set(data.leads.map(r => r.source)).size, 5);
  const months = {};
  for (const r of data.leads) {
    assert.equal(r.totalDesks, r.openDesks + r.cabinDesks);
    assert.equal(r.dateOfContact.getUTCFullYear(), 2026);
    assert.ok(r.dateOfContact <= new Date('2026-09-11'));
    assert.match(r.contactNumber, /^\+91[6-9]\d{9}$/);
    const month = r.dateOfContact.getUTCMonth(); months[month] = (months[month] || 0) + 1;
  }
  assert.deepEqual(Object.values(months), [24, 28, 33, 38, 43, 46]);
  const counts = {};
  for (const vendor of data.vendors) counts[vendor.departmentId] = (counts[vendor.departmentId] || 0) + 1;
  assert.equal(Object.keys(counts).length, 8);
  assert.ok(Object.values(counts).every(n => n >= 2 && n <= 5));
  assert.equal(new Set(Object.values(counts)).size, 4);
  for (const a of data.jobapplications) { assert.equal(a.finalSubmissionDate.getUTCFullYear(), 2026); assert.ok(Number(a.expectedMonthlySalary) > Number(a.currentMonthlySalary)); }
});
