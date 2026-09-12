const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EJSON } = require('bson');
const { build, models } = require('./buildMemberRevenueUpload');
const load = (dir, key) => EJSON.parse(fs.readFileSync(path.join(__dirname, '..', dir, key + '.json'), 'utf8'));
const clients = Object.fromEntries(['coworkingclients', 'virtualofficeclients', 'workationclients'].map(k => [k, load('sales-upload', k)]));
const company = clients.coworkingclients[0].company;
const { data, teamSizes, clientRateUpdates } = build({ clients, company, through: '2026-09-10T09:00:00+05:30' });
test('schema validation, varied bounded team sizes, proper names, and valid member links', () => {
  for (const [key, Model] of Object.entries(models)) {
    assert.equal(new Set(data[key].map(r => String(r._id))).size, data[key].length);
    for (const row of data[key]) assert.equal(new Model(row).validateSync(), undefined);
  }
  assert.ok(new Set(teamSizes.map(t => t.members)).size >= 4);
  assert.ok(teamSizes.every(t => t.members >= 1 && t.members <= t.bookedDesks));
  assert.equal(new Set(data.coworkingmembers.map(m => m.email)).size, data.coworkingmembers.length);
  for (const member of data.coworkingmembers) {
    const client = clients.coworkingclients.find(c => String(c._id) === String(member.client));
    assert.equal(String(member.unit), String(client.unit));
    assert.equal(member.dateOfJoining.getUTCFullYear(), 2026);
    assert.ok(member.dateOfJoining >= client.startDate);
    assert.ok(!/demo|dummy|synthetic|\d/i.test(member.employeeName));
    assert.match(member.mobileNo, /^\+91[6-9]\d{9}$/);
    assert.equal(member.email.split('@')[0], member.employeeName.split(' ')[0].toLowerCase());
    assert.equal(member.email.split('@')[1], client.clientName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com');
  }
});
test('monthly billing respects client starts, totals, paid/unpaid variation and live desk changes', () => {
  for (const row of data.coworkingclientrevenues) {
    const client = clients.coworkingclients.find(c => String(c._id) === String(row.clients));
    assert.ok(row.rentDate >= client.startDate);
    const rates = clientRateUpdates.find(r => String(r._id) === String(client._id));
    assert.equal(row.revenue, client.openDesks * rates.ratePerOpenDesk + client.cabinDesks * rates.ratePerCabinDesk);
  }
  assert.ok(data.virtualofficerevenues.some(r => r.status === true));
  assert.ok(data.virtualofficerevenues.some(r => r.status === false));
  for (const key of ['workationrevenues', 'alternaterevenues']) {
    assert.ok(data[key].some(r => (r.rentStatus || r.status) === 'Paid'));
    assert.ok(data[key].some(r => (r.rentStatus || r.status) === 'Unpaid'));
  }
  for (const row of data.workationrevenues) assert.equal(row.totalAmount, row.taxableAmount + row.gst);
  assert.ok(data.virtualofficerevenues.every(r => r.revenue === Math.round(r.taxableAmount * 1.18 * 100) / 100));
  assert.equal(data.workationrevenues.length, 117);
  assert.equal(new Set(data.workationrevenues.map(r => r.particulars)).size, 3);
  assert.ok(data.alternaterevenues.every(r => r.invoiceAmount >= 250));
  for (const row of data.alternaterevenues) { assert.equal(row.invoiceAmount, row.taxableAmount + row.gst); if (row.status === 'Unpaid') assert.equal(row.invoicePaidDate, undefined); }
  const changed = { ...clients, coworkingclients: clients.coworkingclients.map(c => ({ ...c, openDesks: 1, cabinDesks: 0 })) };
  const refreshed = build({ clients: changed, company, through: '2026-09-10T00:00:00Z' });
  assert.ok(refreshed.teamSizes.every(t => t.members === 1));
});
