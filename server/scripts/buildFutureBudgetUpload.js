const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { EJSON } = require('bson');
const Budget = require('../models/budget/Budget');
const { profiles } = require('./buildBudgetUpload');
const root = path.resolve(__dirname, '..');
const id = key => createHash('sha256').update('future-budget-v1:' + key).digest('hex').slice(0, 24);
function build() {
  const previous = EJSON.parse(fs.readFileSync(path.join(root, 'budget-upload/budgets.json'), 'utf8'));
  const baseline = previous.filter(row => row.month.toISOString().startsWith('2026-09'));
  if (baseline.length !== 24) throw new Error('Expected 24 September budget reference entries');
  const months = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
  const seasonal = [0.96, 1.02, 1.08, 0.99, 1.04, 1.11];
  const rows = [], summary = [];
  months.forEach((month, m) => {
    const departments = {};
    baseline.forEach((original, i) => {
      const departmentName = original.category.replace(/ Operations$/, '');
      if (!profiles[departmentName]) throw new Error('Excluded or unknown department');
      const departmentIndex = Object.keys(profiles).indexOf(departmentName);
      const variation = 0.94 + ((departmentIndex * 7 + m * 3 + i % 3 * 5) % 13) / 100;
      const amount = Math.round(original.projectedAmount * seasonal[m] * variation / 5) * 5;
      const key = `${original._id}:${month}`;
      const row = {
        ...original, _id: id(key), projectedAmount: amount, actualAmount: null,
        actualAmountDate: null, isPaid: 'Unpaid', isOnlyBudget: true,
        dueDate: new Date(`${month}-${String(5 + (departmentIndex * 3 + i % 3 * 7) % 23).padStart(2, '0')}T09:00:00+05:30`),
        month: new Date(`${month}-01T00:00:00Z`),
        srNo: `BUD-${month}-${departmentIndex + 1}-${i % 3 + 1}`,
        particulars: [{ _id: id(key + ':particular'), particularName: original.expanseName, particularAmount: amount }],
        createdAt: new Date('2026-09-12T00:00:00Z'), updatedAt: new Date('2026-09-12T00:00:00Z'),
      };
      const doc = new Budget(row), error = doc.validateSync();
      if (error) throw error;
      rows.push(doc.toObject({ versionKey: false }));
      departments[departmentName] = (departments[departmentName] || 0) + amount;
    });
    summary.push({ month, projectedUSD: Object.values(departments).reduce((a,b) => a+b,0), actualUSD: null, departments });
  });
  return { rows, summary };
}
if (require.main === module) {
  const result = build(), out = path.join(root, 'future-budget-upload');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'budgets.json'), EJSON.stringify(result.rows, null, 2));
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(result.summary, null, 2));
  console.table(result.summary.map(({departments, ...month}) => month));
}
module.exports = { build };
