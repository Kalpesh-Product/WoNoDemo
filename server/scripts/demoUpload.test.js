const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EJSON } = require('bson');
const { models } = require('./buildDemoUpload');
const data = Object.fromEntries(Object.keys(models).map(k => [k, EJSON.parse(fs.readFileSync(path.join(__dirname, '../demo-upload', k + '.json'), 'utf8'))]));
const same = (a, b) => String(a) === String(b);
test('all upload documents validate; demo users have unique identities and valid roles', () => {
  for (const [key, Model] of Object.entries(models)) {
    assert.equal(new Set(data[key].map(r => String(r._id))).size, data[key].length);
    for (const record of data[key]) assert.equal(new Model(record).validateSync(), undefined);
  }
  assert.equal(data.userdatas.length, 24);
  assert.equal(data.roles.length, 8);
  assert.equal(new Set(data.userdatas.map(u => u.email)).size, 24);
  assert.equal(new Set(data.userdatas.map(u => u.empId)).size, 24);
  for (const user of data.userdatas) {
    assert.equal(user.password, undefined);
    assert.equal(user.createdAt.getUTCFullYear(), 2026);
    assert.equal(user.startDate.getUTCFullYear(), 2026);
    assert.ok(user.dateOfBirth.getUTCFullYear() <= 2008);
    for (const role of user.role) assert.ok(data.roles.some(r => same(r._id, role)));
  }
});
test('assignments and stock creators reference generated users with matching companies', () => {
  for (const assignment of data.assignassets) {
    for (const field of ['assignee', 'assignedBy', 'approvedBy']) {
      const user = data.userdatas.find(u => same(u._id, assignment[field]));
      assert.ok(user);
      assert.ok(same(user.company, assignment.company));
    }
    const assignee = data.userdatas.find(u => same(u._id, assignment.assignee));
    assert.ok(assignee.assignedAsset.some(id => same(id, assignment.asset)));
    const asset = data.assets.find(a => same(a._id, assignment.asset));
    assert.ok(asset.isAssigned && same(asset.assignedAsset, assignment._id));
    assert.equal(asset.purchaseDate.getUTCFullYear(), 2026);
  }
  for (const user of data.userdatas) for (const assetId of user.assignedAsset) assert.ok(data.assignassets.some(a => same(a.asset, assetId) && same(a.assignee, user._id)));
  for (const record of [...data.items, ...data.inventories]) assert.ok(data.userdatas.some(u => same(u._id, record.addedBy) && u.departments.some(d => same(d, record.department))));
});
