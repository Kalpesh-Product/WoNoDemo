const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { EJSON } = require('bson');
const Budget = require('../models/budget/Budget');
const profiles = {
  Maintenance: [18, 'Preventive maintenance', 'Repairs and spares', 'Equipment servicing'],
  HR: [16, 'Recruitment services', 'Employee training', 'Employee engagement'],
  'Top Management': [8, 'Strategic planning', 'Business advisory', 'Leadership travel'],
  Tech: [14, 'Cloud infrastructure', 'Software subscriptions', 'Application support'],
  Sales: [12, 'Client engagement', 'Sales travel', 'Sales tools'],
  Finance: [8, 'Accounting services', 'Audit preparation', 'Finance systems'],
  IT: [12, 'Network operations', 'Device servicing', 'Security software'],
  Administration: [12, 'Office supplies', 'Facility services', 'Office utilities'],
};
const stableId = key => createHash('sha256').update('budget-upload-v1:' + key).digest('hex').slice(0, 24);
function build({ departments, units, company, revenue }) {
  const rows = [], summary = [];
  const activeUnits = units.filter(u => String(u.company?.$oid || u.company) === company && u.isActive !== false);
  if (!activeUnits.length) throw new Error('No company units');
  for (const [month, values] of Object.entries(revenue)) {
    const total = Object.entries(values).filter(([k]) => k !== 'month').reduce((n, [, v]) => n + Number(v), 0);
    if (!(total > 0)) throw new Error('No positive revenue for ' + month);
    const budgetCents = Math.floor(total * 100 * 0.6);
    let actualTotal = 0, projectedTotal = 0;
    for (const [index, [name, profile]] of Object.entries(profiles).entries()) {
      const department = departments.find(d => d.name === name);
      if (!department) throw new Error('Missing department: ' + name);
      const departmentId = department._id.$oid || String(department._id);
      for (let line = 0; line < 3; line++) {
        const amount = Math.floor(budgetCents * profile[0] / 100 * [0.5, 0.3, 0.2][line]) / 100;
        const date = new Date(`${month}-0${line + 2}T09:00:00+05:30`);
        const paid = (index + line + Number(month.slice(-2))) % 4 !== 0;
        const actual = paid ? Math.round(amount * (0.78 + ((index + line) % 4) * 0.04) * 100) / 100 : 0;
        const row = { _id: stableId(`${company}:${departmentId}:${month}:${line}`), company, department: departmentId, expanseName: profile[line + 1], expanseType: 'External', paymentType: 'Recurring', projectedAmount: amount, actualAmount: actual, ...(paid ? { actualAmountDate: date } : {}), unit: activeUnits[(index + line) % activeUnits.length]._id.$oid || activeUnits[(index + line) % activeUnits.length]._id, category: name + ' Operations', status: 'Approved', isPaid: paid ? 'Paid' : 'Unpaid', isExtraBudget: false, dueDate: date, month: new Date(`${month}-01T00:00:00Z`), includesBudget: true, isOnlyBudget: false, budgetApproval: true, l1Approval: true, srNo: `BUD-${month}-${index + 1}-${line + 1}`, particulars: [{ _id: stableId(`${departmentId}:${month}:${line}:particular`), particularName: profile[line + 1], particularAmount: amount }], createdAt: new Date(`${month}-01T09:00:00+05:30`), updatedAt: date };
        const doc = new Budget(row), error = doc.validateSync(); if (error) throw error;
        rows.push(doc.toObject({ versionKey: false })); projectedTotal += amount; actualTotal += actual;
      }
    }
    summary.push({ month, revenue: total, budget: Math.round(projectedTotal * 100) / 100, actual: Math.round(actualTotal * 100) / 100 });
  }
  return { rows, summary };
}
if (require.main === module) {
  try {
    const { values } = require('node:util').parseArgs({ options: { source: { type: 'string' }, out: { type: 'string', default: 'budget-upload' } } });
    if (!values.source) throw new Error('--source is required');
    const load = k => JSON.parse(fs.readFileSync(path.join(values.source, `WonoUserData.${k}.json`), 'utf8'));
    const companies = load('companies'); if (companies.length !== 1) throw new Error('Provide one company');
    const result = build({ departments: load('departments'), units: load('units'), company: companies[0]._id.$oid, revenue: JSON.parse(fs.readFileSync('member-revenue-upload/monthly-revenue-preview.json', 'utf8')) });
    fs.mkdirSync(values.out);
    fs.writeFileSync(path.join(values.out, 'budgets.json'), EJSON.stringify(result.rows, null, 2));
    fs.writeFileSync(path.join(values.out, 'summary.json'), JSON.stringify(result.summary, null, 2));
    console.table(result.summary);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { build, profiles };
