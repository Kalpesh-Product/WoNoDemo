const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EJSON } = require('bson');
const { models } = require('./buildPerformanceUpload');
const data = Object.fromEntries(Object.keys(models).map(k => [k, EJSON.parse(fs.readFileSync(path.join(__dirname, '../performance-upload', k + '.json'), 'utf8'))]));
test('valid distinct tasks, dates, departments, and chart distributions', () => {
  for (const [key, Model] of Object.entries(models)) {
    assert.equal(new Set(data[key].map(r => String(r._id))).size, data[key].length);
    for (const row of data[key]) assert.equal(new Model(row).validateSync(), undefined);
  }
  assert.equal(new Set(data.tasks.map(t => String(t.department))).size, 8);
  assert.equal(new Set(data.tasks.map(t => t.status)).size, 3);
  assert.equal(new Set(data.tasks.map(t => t.taskType)).size, 2);
  assert.equal(new Set(data.tasks.map(t => t.taskName)).size, data.tasks.length);
  const cutoff = new Date('2026-09-11T05:58:56Z');
  for (const task of data.tasks) {
    assert.equal(task.assignedDate.getUTCFullYear(), 2026);
    assert.ok(task.assignedDate <= cutoff);
    assert.ok(task.dueDate > task.assignedDate);
    assert.ok(!/demo|dummy|synthetic/i.test(task.taskName + task.description));
    if (task.status === 'Completed') { assert.ok(task.completedDate >= task.assignedDate && task.completedDate <= cutoff); assert.ok(task.completedBy); }
    else assert.equal(task.completedDate, undefined);
  }
});
test('performance completions are unique daily events with valid owner and parent backlinks', () => {
  assert.equal(new Set(data.krakparoles.map(r => r.taskType)).size, 6);
  const seen = new Set();
  for (const event of data.krakpatasks) {
    const parent = data.krakparoles.find(r => String(r._id) === String(event.task));
    assert.ok(parent);
    assert.equal(String(parent.assignTo), String(event.completedBy));
    assert.ok(parent.completedDate.some(d => +d === +event.completionDate));
    assert.ok(event.completionDate >= parent.assignedDate && event.completionDate <= parent.dueDate);
    const key = `${event.task}:${event.completionDate.toISOString().slice(0, 10)}`;
    assert.ok(!seen.has(key)); seen.add(key);
  }
  for (const parent of data.krakparoles) assert.equal(parent.completedDate.length, data.krakpatasks.filter(t => String(t.task) === String(parent._id)).length);
  assert.ok(data.krakparoles.some(r => r.taskType === 'KPA' && r.completedDate.length));
  assert.ok(data.krakparoles.some(r => r.taskType === 'KPA' && !r.completedDate.length));
});
