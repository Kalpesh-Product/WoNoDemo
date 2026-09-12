const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parseArgs } = require('node:util');
const { EJSON } = require('bson');
const { presentation } = require('./activityPresentation');
const models = {
  rooms: require('../models/meetings/Rooms'),
  visitors: require('../models/visitor/Visitor'),
  meetings: require('../models/meetings/Meetings'),
  tickets: require('../models/tickets/Tickets'),
  supporttickets: require('../models/tickets/supportTickets'),
  externalvisits: require('../models/visitor/ExternalVisits'),
};
const id = key => createHash('sha256').update('activity-v1:' + key).digest('hex').slice(0, 24);
function build({ company, units, users, from, through }) {
  const start = new Date(from + 'T00:00:00+05:30');
  const end = new Date(through);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end < start) throw new Error('Invalid date range');
  const companyId = company._id.$oid;
  units = units.filter(u => u.company.$oid === companyId && u.isActive !== false);
  users = users.filter(u => String(u.company) === companyId);
  if (!units.length || !users.length) throw new Error('Missing company units/users');
  const departments = [...new Set(users.flatMap(u => u.departments.map(String)))];
  const data = Object.fromEntries(Object.keys(models).map(k => [k, []]));
  const at = (date, hours) => new Date(+date + hours * 3600000);
  const names = ['Aarav', 'Sofia', 'Leah', 'Ethan', 'Mira', 'Arjun', 'Amelia', 'Zoya'];
  const purposes = ['Project discussion', 'Interview', 'Office tour', 'Vendor consultation', 'Training', 'Partnership review'];
  for (let r = 0; r < units.length; r++) data.rooms.push({ _id: id('room:' + units[r]._id.$oid), roomId: 'RM-' + String(r + 1).padStart(3, '0'), company: companyId, location: units[r]._id.$oid, name: ['Cedar', 'Maple', 'Orchid', 'Horizon', 'Coral'][r % 5] + ' ' + units[r].unitNo, seats: [4, 6, 8, 12][r % 4], description: 'Conference room with display and whiteboard', status: r % 5 === 0 ? 'Cleaning' : 'Available', perHourCredit: 2 + r % 3, perHourPrice: 20 + r * 3, perHourGstPrice: 0, perSeatPrice: 5, dailyHours: 9, monthlyHours: 198 });
  let sequence = 0;
  for (let day = new Date(start); day <= end; day = at(day, 24)) {
    if ([0, 6].includes(new Date(+day + 5.5 * 3600000).getUTCDay())) continue;
    const dayIndex = Math.round((day - start) / 86400000);
    for (let slot = 0; slot < 3 + dayIndex % 4; slot++) {
      const n = sequence++;
      const checkIn = at(day, 9 + slot);
      const checkOut = at(checkIn, 0.5 + n % 3);
      if (checkOut > end) continue;
      const user = users[n % users.length], unit = units[n % units.length];
      const type = ['Walk In', 'Scheduled', 'Meeting', 'Full-Day Pass', 'Half-Day Pass'][n % 5];
      const visitorId = id('visitor:' + n);
      const duration = [15, 30, 60, 90, 120, 150][(dayIndex + slot) % 6];
      const meetingEnd = new Date(+checkIn + duration * 60000);
      const paid = n % 4 !== 0;
      const amount = type === 'Full-Day Pass' ? 35 : type === 'Half-Day Pass' ? 20 : 0;
      const visit = { _id: id('visit:' + n), visitorId, company: companyId, visitorType: type, visitorRoles: ['Visitor'], visitorFlag: 'Visitor', dateOfVisit: checkIn, checkIn, checkOut, checkedInBy: user._id, checkedOutBy: user._id, toMeet: user._id, department: user.departments[0], unit: unit._id.$oid, purposeOfVisit: purposes[n % purposes.length], visitorCompany: ['Northstar Studio', 'Juniper Systems', 'Harbor Consulting', 'Willow Partners'][n % 4], amount, gstAmount: 0, totalAmount: amount, paymentStatus: amount ? paid : true, paymentVerification: paid ? 'Verified' : 'Pending', ...(amount ? { paymentMode: ['Credit Card', 'Cash', 'NEFT'][n % 3] } : {}), createdAt: checkIn, updatedAt: checkOut };
      if (type === 'Full-Day Pass' || type === 'Half-Day Pass') { visit.checkOut = at(checkIn, type === 'Full-Day Pass' ? 8 : 4); if (visit.checkOut > end) continue; visit.updatedAt = visit.checkOut; }
      if (type === 'Scheduled') Object.assign(visit, { scheduledDate: checkIn, scheduledStartTime: checkIn, scheduledEndTime: checkOut });
      const visitor = { ...visit, _id: visitorId, firstName: names[n % names.length], lastName: ['Shah', 'Wilson', 'Mehta', 'Reed', 'Chen'][n % 5], email: `visitor.${n}@example.com`, phoneNumber: '+1202555' + String(100 + n % 100).padStart(4, '0'), city: ['Mumbai', 'Pune', 'Bengaluru', 'Delhi'][n % 4], state: ['Maharashtra', 'Maharashtra', 'Karnataka', 'Delhi'][n % 4], sector: ['Technology', 'Consulting', 'Education', 'Retail', 'Finance'][n % 5], gender: n % 2 ? 'Female' : 'Male' };
      visitor.idProof = { idType: 'Synthetic reference', idNumber: `SYN-${visitorId}` };
      if (type === 'Meeting' || slot < 2) {
        const room = data.rooms[(dayIndex + slot) % data.rooms.length];
        const external = type === 'Meeting';
        const meetingId = id('meeting:' + n);
        const cancelled = !external && n % 7 === 0;
        if (meetingEnd > end) continue;
        data.meetings.push({ _id: meetingId, bookedBy: user._id, receptionist: user._id, bookedRoom: room._id, company: companyId, location: units.find(u => u._id.$oid === room.location).unitNo, startDate: checkIn, endDate: meetingEnd, startTime: checkIn, endTime: meetingEnd, meetingType: external ? 'External' : 'Internal', internalParticipants: [user._id], ...(external ? { externalBookedBy: visitorId, externalClient: visitorId, externalParticipants: [{ _id: id('participant:' + n), name: visitor.firstName + ' ' + visitor.lastName, mobileNumber: visitor.phoneNumber }] } : {}), subject: purposes[n % purposes.length], agenda: purposes[n % purposes.length] + ' and next steps', status: cancelled ? 'Cancelled' : 'Completed', ...(cancelled ? { reason: 'Participants rescheduled the discussion' } : { completedAt: meetingEnd, completedBy: user._id }), creditsUsed: external || cancelled ? 0 : duration / 60 * room.perHourCredit, paymentBaseAmount: external ? duration / 60 * room.perHourPrice : 0, paymentAmount: external ? duration / 60 * room.perHourPrice : 0, paymentGstAmount: 0, paymentStatus: external ? paid : false, paymentVerification: external && paid ? 'Verified' : 'Pending', ...(external ? { paymentMode: ['Credit Card', 'Cash', 'NEFT'][n % 3] } : {}), houeskeepingStatus: n % 5 ? 'Completed' : 'Pending', createdAt: at(checkIn, -1), updatedAt: meetingEnd });
        if (external) { visit.meeting = meetingId; visitor.meeting = meetingId; visit.unit = room.location; visitor.unit = room.location; visit.checkOut = meetingEnd; visitor.checkOut = meetingEnd; visit.updatedAt = meetingEnd; visitor.updatedAt = meetingEnd; }
      }
      data.visitors.push(visitor); data.externalvisits.push(visit);
    }
    for (let t = 0; t < 2 + dayIndex % 3; t++) {
      const n = dayIndex * 5 + t, created = at(day, 9 + t), changed = at(created, 2);
      if (changed > end) continue;
      const department = departments[n % departments.length];
      const handler = users.find(u => u.departments.map(String).includes(department));
      const issues = company.selectedDepartments.find(d => d.department.$oid === department)?.ticketIssues || [];
      if (!issues.length) throw new Error('Missing configured ticket issues for department ' + department);
      const issue = issues[(Math.floor(n / departments.length) + t) % issues.length];
      const status = ['Open', 'In Progress', 'Closed', 'Closed', 'Pending', 'Rejected'][n % 6];
      const ticketId = id('ticket:' + n);
      const ticket = { _id: ticketId, ticket: issue.title, raisedToDepartment: department, raisedBy: users[(n + 4) % users.length]._id, company: companyId, description: `${issue.title}: assistance requested for workstation ${1 + n % 30}.`, status, assignedTo: [{ _id: id('assignee:' + n), assignee: handler._id, assignedAt: at(created, 0.25) }], acceptedAt: at(created, 0.5), acceptedBy: handler._id, createdAt: created, updatedAt: changed };
      if (status === 'Closed') Object.assign(ticket, { closedAt: changed, resolvedDate: changed, closedBy: handler._id, closingRemark: 'Issue resolved and verified with requester' });
      if (status === 'Rejected') ticket.reject = { rejectedBy: handler._id, reason: 'Duplicate request; requester directed to existing ticket', rejectedAt: changed };
      data.tickets.push(ticket);
      if (n % 3 === 0) data.supporttickets.push({ _id: id('support:' + n), ticket: ticketId, user: handler._id, company: companyId, reason: ['Additional troubleshooting required', 'Cross-team assistance requested', 'Follow-up requested by employee'][Math.floor(n / 3) % 3], createdAt: at(created, 0.75), updatedAt: changed });
    }
  }
  presentation(data);
  for (const [key, Model] of Object.entries(models)) data[key] = data[key].map(r => { const doc = new Model(r); const error = doc.validateSync(); if (error) throw error; return doc.toObject({ versionKey: false }); });
  return data;
}
if (require.main === module) {
  try {
    const { values } = parseArgs({ options: { source: { type: 'string' }, users: { type: 'string', default: 'demo-upload/userdatas.json' }, out: { type: 'string', default: 'activity-upload' }, from: { type: 'string', default: '2026-04-01' }, through: { type: 'string', default: new Date().toISOString() } } });
    if (!values.source) throw new Error('--source is required');
    const load = kind => JSON.parse(fs.readFileSync(path.join(values.source, `WonoUserData.${kind}.json`), 'utf8'));
    const companies = load('companies'); if (companies.length !== 1) throw new Error('Select a single company export');
    const data = build({ company: companies[0], units: load('units'), users: EJSON.parse(fs.readFileSync(values.users, 'utf8')), from: values.from, through: values.through });
    fs.mkdirSync(values.out);
    for (const key of Object.keys(models)) fs.writeFileSync(path.join(values.out, key + '.json'), EJSON.stringify(data[key], null, 2));
    const definitions = companies[0].selectedDepartments.flatMap(d => (d.ticketIssues || []).filter(issue => data.tickets.some(t => String(t.raisedToDepartment) === d.department.$oid && t.ticket === issue.title)).map(issue => ({ department: new (require('mongoose').Types.ObjectId)(d.department.$oid), issue: { _id: new (require('mongoose').Types.ObjectId)(issue._id.$oid), title: issue.title, priority: issue.priority } })));
    fs.writeFileSync(path.join(values.out, 'ticketIssues.json'), EJSON.stringify(definitions, null, 2));
    fs.writeFileSync(path.join(values.out, 'manifest.json'), JSON.stringify({ from: values.from, through: values.through, company: companies[0]._id.$oid, counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])) }, null, 2));
    console.table(Object.entries(data).map(([collection, rows]) => ({ collection, records: rows.length })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { build, models };
