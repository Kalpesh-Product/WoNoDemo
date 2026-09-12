const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parseArgs } = require('node:util');
const { EJSON } = require('bson');
const { memberContacts } = require('./memberContacts');
const { applyRevenueScenario } = require('./revenueScenario');
const models = {
  coworkingmembers: require('../models/sales/CoworkingMembers'),
  coworkingclientrevenues: require('../models/sales/CoworkingRevenue'),
  virtualofficerevenues: require('../models/sales/VirtualOfficeRevenue'),
  workationrevenues: require('../models/sales/WorkationRevenue'),
  alternaterevenues: require('../models/sales/AlternateRevenue'),
};
const id = key => createHash('sha256').update('member-revenue-v1:' + key).digest('hex').slice(0, 24);
const money = n => Math.round(n * 100) / 100;
function months(start, through) {
  const date = new Date(start), end = new Date(through);
  if (!Number.isFinite(+date) || !Number.isFinite(+end)) throw new Error('Invalid client start date or cutoff');
  const rows = [];
  // Use UTC month boundaries, retaining the first actual contract date.
  let current = new Date(Math.max(+date, +new Date('2026-04-01T00:00:00Z')));
  while (current <= end) { rows.push(new Date(current)); current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1, 9)); }
  return rows;
}
function build({ clients, company, through }) {
  const result = Object.fromEntries(Object.keys(models).map(k => [k, []]));
  const cutoff = new Date(through);
  const names = ['Aisha Shah', 'Daniel Wilson', 'Priya Mehta', 'Marcus Reed', 'Sofia Chen', 'Omar Patel', 'Maya Brooks', 'Noah Singh', 'Leah Kapoor', 'Ethan Clark', 'Zoya Khan', 'Arjun Rao', 'Amelia Scott', 'Rohan Desai', 'Mira Joshi', 'Oliver Grant', 'Ananya Nair', 'Lucas Bennett', 'Sara Ali', 'Aditya Menon', 'Isabel Costa', 'Kabir Malhotra', 'Nina Kapoor', 'Ryan Thomas'];
  const teamSizes = [];
  clients.coworkingclients.forEach((client, index) => {
    const capacity = Math.floor(Number(client.openDesks || 0) + Number(client.cabinDesks || 0));
    if (capacity < 1) throw new Error('Client has no booked desks: ' + client.clientName);
    const count = 1 + index % Math.min(capacity, 6);
    teamSizes.push({ client: client.clientName, members: count, bookedDesks: capacity });
    for (let m = 0; m < count; m++) {
      const key = String(client._id) + ':' + m;
      const joined = new Date(client.startDate);
      if (joined > cutoff) throw new Error('Client starts after generation cutoff');
      result.coworkingmembers.push({ _id: id('member:' + key), company, client: client._id, unit: client.unit, employeeName: names[(index * 3 + m) % names.length], gender: (index + m) % 2 ? 'Male' : 'Female', designation: ['Account Manager', 'Software Engineer', 'Operations Associate', 'Business Analyst', 'Product Designer', 'Project Coordinator'][(index + m) % 6], mobileNo: '+1202555' + String(100 + (index * 6 + m) % 100).padStart(4, '0'), email: `member.${id(key)}@example.com`, bloodGroup: ['O+', 'A+', 'B+', 'AB+'][(index + m) % 4], dob: new Date(`${1988 + (index + m) % 12}-05-12T00:00:00Z`), dateOfJoining: joined, credits: Number(client.perDeskMeetingCredits || 0), biometricStatus: ['Active', 'Approved', 'Pending'][(index + m) % 3], isActive: true, isDeleted: false, createdAt: joined, updatedAt: joined });
    }
    months(client.startDate, through).forEach((date, month) => {
      const revenue = money(Number(client.openDesks || 0) * Number(client.ratePerOpenDesk || 0) + Number(client.cabinDesks || 0) * Number(client.ratePerCabinDesk || 0));
      const paid = (index + month) % 4 !== 0;
      result.coworkingclientrevenues.push({ _id: id(`coworking:${client._id}:${date.toISOString().slice(0, 7)}`), clients: client._id, company, clientName: client.clientName, clientInvoiceName: client.clientInvoiceName || client.clientName, channel: 'Direct', noOfDesks: capacity, deskRate: money(revenue / capacity), occupation: client.bookingType, revenue, totalTerm: 12, dueTerm: Math.max(0, 12 - month - 1), rentDate: date, rentStatus: paid ? 'Paid' : 'Unpaid', annualIncrement: Number(client.annualIncrement || 0), nextIncrementDate: client.nextIncrement, createdAt: date, updatedAt: date });
    });
  });
  clients.virtualofficeclients.forEach((client, index) => months(client.termStartDate, through).forEach((date, month) => {
    const revenue = [150, 195, 225, 275, 325][index % 5], paid = (index + month) % 3 !== 0;
    result.virtualofficerevenues.push({ _id: id(`virtual:${client._id}:${date.toISOString().slice(0, 7)}`), company, client: client._id, service: client.service, location: client.location, channel: 'Direct', taxableAmount: revenue, revenue, totalTerm: 12, dueTerm: client.termEnd, rentDate: date, rentStatus: paid ? 'Paid' : 'Unpaid', status: paid, annualIncrement: Number(client.annualIncrement || 0), nextIncrementDate: client.nextIncrementDate, createdAt: date, updatedAt: date });
  }));
  clients.workationclients.forEach((client, index) => months(client.startDate, through).forEach((date, month) => {
    const amount = 1500 + index % 5 * 650 + month * 125;
    result.workationrevenues.push({ _id: id(`workation:${client._id}:${date.toISOString().slice(0, 7)}`), company, client: client._id, nameOfClient: client.clientName, particulars: ['Team offsite workspace', 'Weekly workation package', 'Retreat workspace booking'][index % 3], taxableAmount: amount, gst: 0, totalAmount: amount, status: (index + month) % 4 ? 'Paid' : 'Unpaid', date, createdAt: date, updatedAt: date });
  }));
  months('2026-04-01T09:00:00Z', through).forEach((date, month) => {
    for (let i = 0; i < 4; i++) {
      const day = new Date(+date + i * 86400000); if (day > cutoff) continue;
      const paid = (month + i) % 3 !== 0, amount = [250, 650, 1200, 350][i] + month * 25;
      result.alternaterevenues.push({ _id: id(`alternate:${company}:${day.toISOString().slice(0, 10)}:${i}`), company, name: ['Harbor Advisory', 'Willow Creative', 'Northstar Analytics', 'Juniper Technologies'][i], particulars: ['Printing and document services', 'Event equipment rental', 'Business workshop', 'Storage locker subscription'][i], taxableAmount: amount, gst: 0, invoiceAmount: amount, invoiceCreationDate: day, ...(paid ? { invoicePaidDate: day } : {}), status: paid ? 'Paid' : 'Unpaid', createdAt: day, updatedAt: day });
    }
  });
  const clientRateUpdates = applyRevenueScenario(result, clients);
  result.coworkingmembers.forEach(member => {
    const clientIndex = clients.coworkingclients.findIndex(c => String(c._id) === String(member.client));
    const client = clients.coworkingclients[clientIndex];
    const peers = result.coworkingmembers.filter(m => String(m.client) === String(member.client));
    Object.assign(member, memberContacts(member.employeeName, client.clientName, clientIndex * 10 + peers.indexOf(member)));
  });
  for (const [key, Model] of Object.entries(models)) result[key] = result[key].map(row => { const doc = new Model(row); const error = doc.validateSync(); if (error) throw error; return doc.toObject({ versionKey: false }); });
  return { data: result, teamSizes, clientRateUpdates };
}
if (require.main === module) {
  try {
    const { values } = parseArgs({ options: { out: { type: 'string', default: 'member-revenue-upload' }, through: { type: 'string', default: new Date().toISOString() } } });
    const clients = Object.fromEntries(['coworkingclients', 'virtualofficeclients', 'workationclients'].map(k => [k, EJSON.parse(fs.readFileSync(path.join('sales-upload', k + '.json'), 'utf8'))]));
    const company = clients.coworkingclients[0].company;
    const { data, teamSizes } = build({ clients, company, through: values.through });
    fs.mkdirSync(values.out);
    for (const [k, rows] of Object.entries(data)) fs.writeFileSync(path.join(values.out, k + '.json'), EJSON.stringify(rows, null, 2));
    fs.writeFileSync(path.join(values.out, 'manifest.json'), JSON.stringify({ company: String(company), through: values.through, clientIds: Object.fromEntries(Object.entries(clients).map(([k, rows]) => [k, rows.map(r => String(r._id))])), teamSizes }, null, 2));
    console.table(teamSizes); console.log(Object.fromEntries(Object.entries(data).map(([k, rows]) => [k, rows.length])));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { build, models };
