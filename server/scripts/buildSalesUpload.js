const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parseArgs } = require('node:util');
const { EJSON } = require('bson');
const serviceReferences = require('./salesServiceReferences.json');
const models = {
  clientservices: require('../models/sales/ClientService'),
  coworkingclients: require('../models/sales/CoworkingClient'),
  virtualofficeclients: require('../models/sales/VirtualOfficeClient'),
  workationclients: require('../models/sales/WorkationClients'),
  meetingclientrevenues: require('../models/sales/MeetingRevenue'),
};
const id = key => createHash('sha256').update('sales-upload-v1:' + key).digest('hex').slice(0, 24);
function revenueFor(meeting, room, visitor) {
  if (meeting.meetingType !== 'External' || meeting.status === 'Cancelled') throw new Error('Revenue requires a non-cancelled external meeting');
  if (!room || !visitor || String(room.company) !== String(meeting.company) || String(visitor.company) !== String(meeting.company)) throw new Error('Meeting room/client company mismatch');
  const hours = (new Date(meeting.endTime) - new Date(meeting.startTime)) / 3600000;
  if (!(hours > 0)) throw new Error('Invalid meeting duration');
  const taxable = Number(meeting.paymentBaseAmount), gst = Number(meeting.paymentGstAmount || 0), totalAmount = Number(meeting.paymentAmount);
  if (![taxable, gst, totalAmount].every(v => Number.isFinite(v) && v >= 0)) throw new Error('Invalid meeting amounts');
  const client = visitor.registeredClientCompany || visitor.visitorCompany || [visitor.firstName, visitor.lastName].filter(Boolean).join(' ');
  return { _id: id('revenue:' + meeting._id), meeting: meeting._id, company: meeting.company, client, particulars: 'Meeting room booking', unitsOrHours: 'Hours', hoursBooked: String(hours), costPerHour: room.perHourPrice, meetingRoomName: room.name, taxable, gst, totalAmount, date: meeting.startDate, status: meeting.paymentStatus ? 'Paid' : 'Unpaid', ...(meeting.paymentStatus ? { paymentDate: meeting.completedAt || meeting.endTime } : {}), remarks: meeting.paymentMode || '', createdAt: meeting.createdAt || meeting.startDate, updatedAt: meeting.updatedAt || meeting.endTime };
}
function build({ company, units, activity, asOf }) {
  const companyId = company._id.$oid;
  const data = Object.fromEntries(Object.keys(models).map(k => [k, []]));
  const date = month => new Date(`2026-${String(month).padStart(2, '0')}-01T09:00:00+05:30`);
  const services = ['Co-working', 'Virtual Office'].map(serviceName => {
    const reference = serviceReferences.find(s => s.company === companyId && s.serviceName === serviceName);
    if (!reference) throw new Error('Missing supplied service reference: ' + serviceName);
    return { ...reference, isActive: true };
  });
  data.clientservices = services;
  const names = ['Northstar Analytics', 'Juniper Technologies', 'Harbor Advisory', 'Willow Creative', 'Cobalt Ventures', 'Meridian Consulting', 'Atlas Learning', 'Orchid Commerce', 'Aspen Digital', 'Cedar Labs', 'Horizon Logistics', 'Coral Media', 'Summit Strategy', 'Aurora Design', 'Maple Finance', 'Sapphire Systems', 'Solstice Research', 'Riverstone Studio'];
  const sectors = ['Technology', 'Consulting', 'Education', 'Retail', 'Finance', 'Design'];
  units = units.filter(u => u.company.$oid === companyId && u.isActive !== false);
  const usable = units.filter(u => u.openDesks > 0 || u.cabinDesks > 0);
  if (!usable.length || !units.length) throw new Error('No eligible units');
  for (let i = 0; i < 18; i++) {
    const unit = usable[i % usable.length];
    const start = date(4 + i % 6), end = new Date(start); end.setUTCFullYear(end.getUTCFullYear() + 1);
    const openDesks = Math.min(2 + i % 3, Math.floor(Number(unit.openDesks || 0) / 3));
    const cabinDesks = i % 2 ? Math.min(2, Math.floor(Number(unit.cabinDesks || 0) / 3)) : 0;
    const totalDesks = openDesks + cabinDesks;
    const name = names[i];
    data.coworkingclients.push({ _id: id('coworking:' + companyId + ':' + i), company: companyId, clientName: name, clientInvoiceName: name + ' Pvt Ltd', brandName: name, email: `workspace.${i + 1}@example.com`, phone: '+1202555' + String(100 + i).padStart(4, '0'), service: services[0]._id, bookingType: cabinDesks ? 'Private Office' : 'Dedicated Desk', sector: sectors[i % 6], hoCity: ['Mumbai', 'Pune', 'Bengaluru'][i % 3], hoState: i % 3 === 2 ? 'Karnataka' : 'Maharashtra', unit: unit._id.$oid, building: unit.building?.$oid, openDesks, cabinDesks, totalDesks, ratePerOpenDesk: 180 + i % 4 * 25, ratePerCabinDesk: 300 + i % 3 * 30, annualIncrement: 5, perDeskMeetingCredits: 2, totalMeetingCredits: totalDesks * 2, meetingCreditBalance: totalDesks * 2, startDate: start, endDate: end, nextIncrement: end, lockinPeriod: 6, rentDate: start, localPoc: { name: ['Aisha Shah', 'Daniel Wilson', 'Priya Mehta'][i % 3], email: `contact.workspace.${i + 1}@example.com`, phone: '+12025550150' }, isActive: true, lastCreditReset: new Date(asOf), createdAt: start, updatedAt: start });
  }
  for (let i = 0; i < 12; i++) {
    const unit = units[i % units.length], start = date(4 + i % 6), end = new Date(start); end.setUTCFullYear(end.getUTCFullYear() + 1);
    const name = ['Oakridge Solutions', 'Bluewater Advisory', 'Silverline Commerce', 'Meadow Analytics', 'Pinecrest Ventures', 'Brightfield Labs', 'Westbridge Media', 'Clearview Consulting', 'Seabrook Design', 'Greenstone Digital', 'Fairview Learning', 'Redwood Partners'][i];
    data.virtualofficeclients.push({ _id: id('virtual:' + companyId + ':' + i), company: companyId, clientName: name, brandName: name, email: `office.${i + 1}@example.com`, phone: '+1202555' + String(150 + i).padStart(4, '0'), service: services[1]._id, bookingType: 'Virtual Office', sector: sectors[i % 6], city: ['Mumbai', 'Pune', 'Bengaluru'][i % 3], state: i % 3 === 2 ? 'Karnataka' : 'Maharashtra', channel: ['Direct', 'Referral', 'Website'][i % 3], unit: unit._id.$oid, building: unit.building?.$oid, location: unit.unitNo, termStartDate: start, termEnd: end, lockInPeriodMonths: 3, rentDate: start, nextIncrementDate: end, annualIncrement: 5, totalTerm: 12, securityDeposit: 100 + i * 10, clientStatus: true, rentStatus: 'Active', localPoc: { name: ['Mira Shah', 'Omar Patel', 'Leah Chen'][i % 3], email: `contact.office.${i + 1}@example.com`, phone: '+12025550180' }, createdAt: start, updatedAt: start });
  }
  for (let i = 0; i < 10; i++) data.workationclients.push({ _id: id('workation:' + companyId + ':' + i), clientName: ['Trailhead Collective', 'Coastline Creative', 'Evergreen Strategy', 'Suncrest Studio', 'Lakeside Labs', 'Windward Partners', 'Fieldstone Design', 'Highland Analytics', 'Bayview Digital', 'Brookside Consulting'][i], startDate: date(4 + i % 6) });
  data.meetingclientrevenues = activity.meetings.filter(m => m.meetingType === 'External' && m.status !== 'Cancelled').map(m => revenueFor(m, activity.rooms.find(r => String(r._id) === String(m.bookedRoom)), activity.visitors.find(v => String(v._id) === String(m.externalClient || m.externalBookedBy))));
  for (const [key, Model] of Object.entries(models)) data[key] = data[key].map(r => { const doc = new Model(r); const error = doc.validateSync(); if (error) throw error; return doc.toObject({ versionKey: false }); });
  return data;
}
if (require.main === module) {
  try {
    const { values } = parseArgs({ options: { source: { type: 'string' }, out: { type: 'string', default: 'sales-upload' }, 'as-of': { type: 'string', default: new Date().toISOString() } } });
    if (!values.source) throw new Error('--source is required');
    const load = k => JSON.parse(fs.readFileSync(path.join(values.source, `WonoUserData.${k}.json`), 'utf8'));
    const companies = load('companies'); if (companies.length !== 1) throw new Error('Provide one company');
    const activity = Object.fromEntries(['rooms', 'meetings', 'visitors'].map(k => [k, EJSON.parse(fs.readFileSync(path.join('activity-upload', k + '.json'), 'utf8'))]));
    const data = build({ company: companies[0], units: load('units'), activity, asOf: values['as-of'] });
    fs.mkdirSync(values.out);
    for (const [key, rows] of Object.entries(data)) fs.writeFileSync(path.join(values.out, key + '.json'), EJSON.stringify(rows, null, 2));
    fs.writeFileSync(path.join(values.out, 'manifest.json'), JSON.stringify({ company: companies[0]._id.$oid, asOf: values['as-of'] }, null, 2));
    console.table(Object.entries(data).map(([collection, rows]) => ({ collection, records: rows.length })));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { models, build, revenueFor };
