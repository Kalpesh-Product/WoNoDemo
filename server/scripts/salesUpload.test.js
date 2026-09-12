const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EJSON } = require('bson');
const { models, revenueFor } = require('./buildSalesUpload');
const load = (dir, name) => EJSON.parse(fs.readFileSync(path.join(__dirname, '..', dir, name + '.json'), 'utf8'));
const data = Object.fromEntries(Object.keys(models).map(k => [k, load('sales-upload', k)]));
const activity = Object.fromEntries(['meetings', 'rooms', 'visitors'].map(k => [k, load('activity-upload', k)]));
test('all sales records validate, references match, and activity dates are 2026', () => {
  for (const [key, Model] of Object.entries(models)) {
    assert.equal(new Set(data[key].map(r => String(r._id))).size, data[key].length);
    for (const row of data[key]) {
      assert.equal(new Model(row).validateSync(), undefined);
      for (const field of ['date', 'startDate', 'termStartDate', 'createdAt', 'lastCreditReset']) if (row[field]) assert.equal(row[field].getUTCFullYear(), 2026);
      if (row.clientName) assert.ok(!/demo|dummy|synthetic/i.test(row.clientName));
    }
  }
  for (const row of [...data.coworkingclients, ...data.virtualofficeclients]) assert.ok(data.clientservices.some(s => String(s._id) === String(row.service)));
  for (const client of data.coworkingclients) {
    assert.equal(client.totalDesks, client.openDesks + client.cabinDesks);
    assert.equal(client.totalMeetingCredits, client.totalDesks * client.perDeskMeetingCredits);
    assert.ok(client.endDate > client.startDate);
  }
});
test('revenue matches each external meeting exactly once and refreshes from source', () => {
  const external = activity.meetings.filter(m => m.meetingType === 'External' && m.status !== 'Cancelled');
  assert.equal(data.meetingclientrevenues.length, external.length);
  assert.equal(new Set(data.meetingclientrevenues.map(r => String(r.meeting))).size, external.length);
  assert.ok(data.meetingclientrevenues.some(r => r.status === 'Paid'));
  assert.ok(data.meetingclientrevenues.some(r => r.status === 'Unpaid'));
  for (const row of data.meetingclientrevenues) {
    const meeting = external.find(m => String(m._id) === String(row.meeting));
    const room = activity.rooms.find(r => String(r._id) === String(meeting.bookedRoom));
    const visitor = activity.visitors.find(v => String(v._id) === String(meeting.externalClient));
    assert.equal(row.totalAmount, meeting.paymentAmount);
    assert.equal(Number(row.hoursBooked), (meeting.endTime - meeting.startTime) / 3600000);
    assert.equal(row.meetingRoomName, room.name);
    assert.equal(row.client, visitor.registeredClientCompany);
    assert.equal(row.status, meeting.paymentStatus ? 'Paid' : 'Unpaid');
    if (!meeting.paymentStatus) assert.equal(row.paymentDate, undefined);
    assert.equal(revenueFor(meeting, { ...room, name: 'Updated Room' }, visitor).meetingRoomName, 'Updated Room');
    assert.throws(() => revenueFor({ ...meeting, meetingType: 'Internal' }, room, visitor));
  }
});
