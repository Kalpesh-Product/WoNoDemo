const assert = require('node:assert/strict');
const { build } = require('./buildFutureBudgetUpload');
const { validate } = require('./importFutureBudgetUpload');
const { EJSON } = require('bson');
const { rows, summary } = build();
validate(EJSON.parse(EJSON.stringify(rows)));
assert.equal(rows.length,144);
assert.equal(new Set(rows.map(r => String(r.department))).size,8);
assert.equal(summary.length,6);
for (const month of summary) {
  assert.equal(rows.filter(r => r.month.toISOString().startsWith(month.month)).length,24);
  assert(month.projectedUSD > 0 && month.projectedUSD < 187114);
  assert.equal(Object.keys(month.departments).length,8);
}
for (const row of rows) {
  assert.equal(row.actualAmount,null);
  assert.equal(row.actualAmountDate,null);
  assert.equal(row.isPaid,'Unpaid');
  assert.equal(row.isOnlyBudget,true);
  assert(row.dueDate >= new Date('2026-10-01') && row.dueDate < new Date('2027-04-01'));
  assert.equal(row.month.getUTCMonth(),row.dueDate.getUTCMonth());
  assert.equal(row.particulars.reduce((n,p) => n+p.particularAmount,0),row.projectedAmount);
}
for (const name of Object.keys(summary[0].departments)) assert(new Set(summary.map(r => r.departments[name])).size >= 4);
const altered = EJSON.parse(EJSON.stringify(rows)); altered[0].actualAmount = 500;
assert.throws(() => validate(altered));
console.log('Passed: 144 budgets, references, six months, eight departments, varied projections, empty actuals, and import file validation.');
