const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EJSON } = require('bson');
const { models } = require('./buildActivityUpload');
const { references, missingIssues } = require('./importActivityUpload');
const load = name => EJSON.parse(fs.readFileSync(path.join(__dirname, '../activity-upload', name + '.json'), 'utf8'));
const data = Object.fromEntries(Object.keys(models).map(k => [k, load(k)]));
const manifest = load('manifest');
const start = new Date(manifest.from + 'T00:00:00+05:30'), end = new Date(manifest.through);
test('rooms have distinct names and paid-service visitors are classified as clients', () => {
  assert.equal(new Set(data.rooms.map(r => r.name)).size, data.rooms.length);
  for (const room of data.rooms) assert.ok(!/demo|dummy|synthetic|ST \d/i.test(room.name));
  for (const key of ['visitors', 'externalvisits']) for (const row of data[key]) {
    const client = ['Meeting', 'Full-Day Pass', 'Half-Day Pass'].includes(row.visitorType);
    assert.equal(row.visitorFlag, client ? 'Client' : 'Visitor');
    assert.ok(row.visitorRoles.includes(row.visitorFlag));
    if (client && key === 'visitors') assert.ok(row.registeredClientCompany && row.brandName);
  }
});
test('visitor ID-proof references are nonempty, unique, and stable', () => {
  const numbers = data.visitors.map(v => v.idProof?.idNumber);
  assert.equal(new Set(numbers).size, data.visitors.length);
  for (const visitor of data.visitors) {
    assert.equal(visitor.idProof.idNumber, `SYN-${visitor._id}`);
    assert.equal(visitor.idProof.idType, 'Reference');
  }
});
test('missing ticket issues are planned once, preserving existing definitions', () => {
  const definitions = load('ticketIssues');
  const company = { selectedDepartments: [...new Set(data.tickets.map(t => String(t.raisedToDepartment)))].map(department => ({ department, ticketIssues: [] })) };
  const additions = missingIssues(company, data.tickets, definitions);
  assert.equal(additions.length, definitions.length);
  assert.ok(additions.some(d => d.issue.title === 'AC Issues'));
  for (const addition of additions) company.selectedDepartments.find(d => d.department === String(addition.department)).ticketIssues.push({ ...addition.issue, priority: 'Low' });
  assert.deepEqual(missingIssues(company, data.tickets, definitions), []);
  assert.ok(company.selectedDepartments.every(d => d.ticketIssues.every(i => i.priority === 'Low')));
  assert.throws(() => missingIssues({ selectedDepartments: [] }, data.tickets, definitions), /does not include department/);
});
test('schemas, reference graph, and date bounds', () => {
  const refs = references(data);
  for (const [key, Model] of Object.entries(models)) {
    const ids = new Set(data[key].map(r => String(r._id)));
    assert.equal(ids.size, data[key].length);
    for (const ref of refs.filter(r => r.model === Model.modelName)) assert.ok(ids.has(String(ref.id)));
    for (const row of data[key]) {
      assert.equal(new Model(row).validateSync(), undefined);
      function dates(value) {
        if (value instanceof Date) assert.ok(value >= start && value <= end, value.toISOString());
        else if (Array.isArray(value)) value.forEach(dates);
        else if (value && typeof value === 'object' && !value._bsontype) Object.values(value).forEach(dates);
      }
      dates(row);
    }
  }
});
test('widgets have diverse historical series and consistent visits and bookings', () => {
  assert.equal(new Set(data.externalvisits.map(v => v.visitorType)).size, 5);
  assert.equal(new Set(data.tickets.map(t => t.status)).size, 5);
  assert.equal(new Set(data.tickets.map(t => String(t.raisedToDepartment))).size, 8);
  assert.equal(new Set(data.meetings.map(m => m.meetingType)).size, 2);
  assert.equal(new Set(data.meetings.map(m => (m.endTime - m.startTime) / 60000)).size, 6);
  for (const key of ['meetings', 'tickets', 'externalvisits']) assert.equal(new Set(data[key].map(r => (r.startTime || r.checkIn || r.createdAt).getUTCMonth())).size, 6);
  for (const room of data.rooms) {
    const bookings = data.meetings.filter(m => String(m.bookedRoom) === String(room._id) && m.status !== 'Cancelled').sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < bookings.length; i++) assert.ok(bookings[i].startTime >= bookings[i - 1].endTime);
  }
  for (const visit of data.externalvisits) {
    assert.ok(visit.checkOut > visit.checkIn);
    assert.equal(visit.totalAmount, visit.amount + visit.gstAmount - visit.discount);
    if (visit.meeting) assert.ok(data.meetings.some(m => String(m._id) === String(visit.meeting) && String(m.externalBookedBy) === String(visit.visitorId)));
  }
});
