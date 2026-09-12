const test = require('node:test');
const assert = require('node:assert/strict');
const { allocateClientDesks } = require('./allocateClientDesks');
const unit = { _id: 'u1', unitNo: 'ST 701 A', openDesks: 112, cabinDesks: 7, building: 'b1' };
const client = { _id: 'c1', clientName: 'Harbor Advisory', unit: 'u1', openDesks: 2, cabinDesks: 2, perDeskMeetingCredits: 2 };
test('uses remaining capacity rather than full exported capacity', () => {
  const existing = [{ _id: 'old', unit: 'u1', openDesks: 100, cabinDesks: 7, isActive: true }];
  const result = allocateClientDesks([client], [unit], existing);
  assert.equal(result.clients[0].openDesks, 4);
  assert.equal(result.clients[0].cabinDesks, 0);
  assert.equal(result.clients[0].totalMeetingCredits, 8);
  assert.equal(existing[0].cabinDesks, 7);
});
test('moves new clients only when intended unit is full and does not overallocate sequential clients', () => {
  const other = { ...unit, _id: 'u2', unitNo: 'ST 501 A', building: 'b2', openDesks: 4, cabinDesks: 0 };
  const existing = [{ _id: 'old', unit: 'u1', openDesks: 112, cabinDesks: 7 }];
  const result = allocateClientDesks([client], [unit, other], existing);
  assert.equal(result.clients[0].unit, 'u2');
  assert.equal(result.clients[0].building, 'b2');
  assert.throws(() => allocateClientDesks([client, { ...client, _id: 'c2' }], [unit, other], existing), /Insufficient remaining capacity/);
});
test('reruns preserve existing clients and inactive occupants do not consume capacity', () => {
  assert.deepEqual(allocateClientDesks([client], [unit], [client]).clients, [client]);
  const result = allocateClientDesks([client], [unit], [{ _id: 'old', unit: 'u1', openDesks: 112, cabinDesks: 7, isActive: false }]);
  assert.equal(result.clients[0].cabinDesks, 2);
  assert.equal(result.changes.length, 0);
});
