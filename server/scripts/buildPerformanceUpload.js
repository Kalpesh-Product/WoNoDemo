const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { EJSON } = require('bson');
const models = { tasks: require('../models/tasks/Task'), krakparoles: require('../models/performances/kraKpaRole'), krakpatasks: require('../models/performances/kraKpaTask') };
const id = key => createHash('sha256').update('performance-v1:' + key).digest('hex').slice(0, 24);
const subjects = {
  Maintenance: ['air-conditioning service', 'electrical safety', 'water-system inspection', 'equipment reliability', 'repair scheduling', 'vendor service quality'],
  HR: ['candidate screening', 'onboarding readiness', 'training participation', 'attendance accuracy', 'employee feedback', 'policy communication'],
  'Top Management': ['operating priorities', 'investment review', 'leadership alignment', 'business continuity', 'quarterly objectives', 'partner relationships'],
  Tech: ['application reliability', 'release readiness', 'API response times', 'data integrity', 'cloud cost control', 'deployment automation'],
  Sales: ['pipeline qualification', 'client proposals', 'renewal readiness', 'account engagement', 'conversion analysis', 'customer handover'],
  Finance: ['invoice reconciliation', 'collection follow-up', 'expense verification', 'cash-flow forecasting', 'month-end reporting', 'vendor settlements'],
  IT: ['network availability', 'device configuration', 'access reviews', 'endpoint security', 'backup recovery', 'service-desk resolution'],
  Administration: ['workspace readiness', 'supplier coordination', 'stock replenishment', 'reception coverage', 'facility scheduling', 'document control'],
};
function build({ departments, users, units, through }) {
  const end = new Date(through);
  if (!Number.isFinite(+end) || end < new Date('2026-04-01')) throw new Error('Invalid cutoff');
  const data = Object.fromEntries(Object.keys(models).map(k => [k, []]));
  const summary = [];
  for (const [deptIndex, [name, themes]] of Object.entries(subjects).entries()) {
    const department = departments.find(d => d.name === name); if (!department) throw new Error('Missing department: ' + name);
    const deptId = department._id.$oid || String(department._id);
    const team = users.filter(u => u.departments.some(d => String(d) === deptId));
    if (team.length < 3) throw new Error('Expected at least three users for ' + name);
    const company = team[0].company;
    const locations = units.filter(u => String(u.company?.$oid || u.company) === String(company) && u.isActive !== false);
    if (!locations.length) throw new Error('Missing company locations');
    for (let month = 3; month <= end.getUTCMonth(); month++) {
      const monthName = new Date(Date.UTC(2026, month, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
      const monthEnd = new Date(Math.min(+end, Date.UTC(2026, month + 1, 0, 18)));
      const count = 8 + (deptIndex * 3 + month) % 7;
      const start = new Date(Date.UTC(2026, month, 1, 3));
      const span = Math.max(1, Math.floor((monthEnd - start) / 86400000));
      let completed = 0, generated = 0;
      for (let n = 0; n < count; n++) {
        const assigned = new Date(+start + (n % Math.min(20, span)) * 86400000);
        if (assigned > end) continue;
        const due = new Date(+assigned + (1 + n % 4) * 86400000);
        const completion = new Date(+assigned + (0.5 + n % 3) * 86400000);
        const success = (n * 7 + deptIndex * 3 + month) % 10 < 5 + (month + deptIndex) % 4 && completion <= end;
        const status = success ? 'Completed' : n % 3 ? 'Pending' : 'InProgress';
        const owner = team[n % team.length];
        const theme = themes[n % themes.length];
        const phase = ['readiness assessment', 'action plan', 'quality review'][Math.floor(n / themes.length)];
        const self = n % 4 === 0;
        data.tasks.push({ _id: id(`task:${deptId}:${month}:${n}`), company, department: deptId, assignedBy: self ? owner._id : team[0]._id, assignedTo: [owner._id], taskType: self ? 'Self' : 'Department', taskName: `${theme[0].toUpperCase() + theme.slice(1)}: ${monthName} ${phase}`, description: `Review ${theme}, document the findings, and agree follow-up actions with ${owner.firstName} ${owner.lastName}. Scope: ${monthName} ${phase}.`, assignedDate: assigned, dueDate: due, dueTime: due, status, ...(success ? { completedBy: owner._id, completedDate: completion } : {}), workCategory: n % 3 ? 'Internal' : 'External', location: locations[(deptIndex + n) % locations.length]._id.$oid || locations[(deptIndex + n) % locations.length]._id, isDeleted: false, comment: success ? 'Review completed; findings recorded and actions handed over.' : status === 'InProgress' ? 'Evidence is being gathered; follow-up work is underway.' : 'Awaiting the next scheduled review.', createdAt: assigned, updatedAt: success ? completion : assigned });
        generated++; if (success) completed++;
      }
      const types = ['KRA', 'KPA', 'INDIVIDUALKRA', 'INDIVIDUALKPA', 'TEAMKRA', 'TEAMKPA'];
      for (const [i, taskType] of types.entries()) {
        const owner = team[i % team.length];
        const roleId = id(`role:${deptId}:${month}:${i}`);
        const daily = taskType.endsWith('KRA');
        const role = { _id: roleId, company, department: deptId, assignedBy: team[0]._id, assignTo: owner._id, role: owner.role[0], task: `${themes[i][0].toUpperCase() + themes[i].slice(1)} — ${monthName} ${daily ? 'operating checks' : 'delivery objective'}`, description: daily ? `Check ${themes[i]} each working day, record exceptions, and follow up on unresolved actions.` : `Complete the ${monthName} review of ${themes[i]} and submit evidence with the agreed improvement actions.`, taskType, ...(daily ? {} : { kpaDuration: 'Monthly' }), assignedDate: start, dueDate: new Date(Date.UTC(2026, month + 1, 0, 12)), dueTime: '17:30', status: 'Pending', isDeleted: false, completedDate: [], createdAt: start, updatedAt: start };
        const days = daily ? Array.from({ length: span + 1 }, (_, n) => n) : [Math.min(5 + (deptIndex + i) % 18, span)];
        for (const day of days) {
          const date = new Date(+start + day * 86400000 + 2 * 3600000);
          if (date > end || [0, 6].includes(date.getUTCDay())) continue;
          if ((day * 3 + i + deptIndex + month) % 10 >= 5 + (deptIndex + month) % 4) continue;
          role.completedDate.push(date); role.updatedAt = date;
          data.krakpatasks.push({ _id: id(`completion:${roleId}:${day}`), company, task: roleId, completedBy: owner._id, status: 'Completed', completionDate: date, comment: `${themes[i][0].toUpperCase() + themes[i].slice(1)} checked; supporting evidence and follow-up actions recorded for ${date.toISOString().slice(0, 10)}.`, createdAt: date, updatedAt: date });
        }
        data.krakparoles.push(role);
      }
      summary.push({ department: name, month: monthName, tasks: generated, completed });
    }
  }
  for (const [key, Model] of Object.entries(models)) data[key] = data[key].map(row => { const doc = new Model(row); const error = doc.validateSync(); if (error) throw error; return doc.toObject({ versionKey: false }); });
  return { data, summary };
}
if (require.main === module) {
  try {
    const { values } = require('node:util').parseArgs({ options: { source: { type: 'string' }, out: { type: 'string', default: 'performance-upload' }, through: { type: 'string', default: new Date().toISOString() } } });
    if (!values.source) throw new Error('--source is required');
    const load = k => JSON.parse(fs.readFileSync(path.join(values.source, `WonoUserData.${k}.json`), 'utf8'));
    const result = build({ departments: load('departments'), units: load('units'), users: EJSON.parse(fs.readFileSync('demo-upload/userdatas.json', 'utf8')), through: values.through });
    fs.mkdirSync(values.out);
    for (const [k, rows] of Object.entries(result.data)) fs.writeFileSync(path.join(values.out, k + '.json'), EJSON.stringify(rows, null, 2));
    fs.writeFileSync(path.join(values.out, 'summary.json'), JSON.stringify(result.summary, null, 2));
    console.log(Object.fromEntries(Object.entries(result.data).map(([k, rows]) => [k, rows.length])));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { build, models };
