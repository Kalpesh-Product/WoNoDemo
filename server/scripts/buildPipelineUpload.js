const fs = require('node:fs');
const path = require('node:path');
const { EJSON } = require('bson');
const { createHash } = require('node:crypto');
const models = { leads: require('../models/sales/Lead'), jobapplications: require('../models/hr/JobApplications'), vendors: require('../models/hr/Vendor') };
const id = key => createHash('sha256').update('pipeline-v1:' + key).digest('hex').slice(0, 24);
const serviceIds = ['67d56b05ac5326fb7189d89e', '67d56bacac5326fb7189d8b2', '67d56b71ac5326fb7189d8aa', '67d56b8eac5326fb7189d8ae'];
const departmentsIncluded = ['Maintenance', 'HR', 'Top Management', 'Tech', 'Sales', 'Finance', 'IT', 'Administration'];
function build({ company, departments, units }) {
  const result = { leads: [], jobapplications: [], vendors: [] };
  const locations = units.filter(u => u.company.$oid === company && u.isActive !== false);
  if (!locations.length) throw new Error('Missing active company units');
  const firstNames = ['Aisha', 'Arjun', 'Priya', 'Rohan', 'Maya', 'Kabir', 'Zoya', 'Aditya', 'Ananya', 'Omar', 'Nina', 'Vikram', 'Leah', 'Ishaan', 'Sara', 'Dev', 'Mira', 'Karan', 'Sofia', 'Nikhil', 'Riya', 'Aarav', 'Tara', 'Ravi', 'Neha', 'Sahil', 'Meera', 'Varun', 'Isha', 'Rahul'];
  const surnames = ['Shah', 'Rao', 'Mehta', 'Desai', 'Kapoor', 'Menon', 'Khan', 'Nair', 'Joshi', 'Patel'];
  const prefixes = ['Silverbrook', 'Westhaven', 'Oakfield', 'Crestwood', 'Lakefront', 'Ashford', 'Stonebridge', 'Seaview', 'Brighton', 'Pinehill', 'Windcrest', 'Fairmont', 'Rosewood', 'Clearbrook', 'Glenwood', 'Baystone', 'Redfield', 'Hillcrest', 'Springvale', 'Woodhaven', 'Eastgate', 'Riverton', 'Larkspur', 'Brookhaven'];
  const suffixes = ['Analytics', 'Technologies', 'Advisory', 'Design', 'Commerce', 'Learning', 'Logistics', 'Consulting', 'Ventures'];
  const cityPairs = [['Mumbai', 'Maharashtra'], ['Pune', 'Maharashtra'], ['Bengaluru', 'Karnataka'], ['Panaji', 'Goa'], ['Delhi', 'Delhi']];
  let sequence = 0;
  [24, 28, 33, 38, 43, 46].forEach((count, monthIndex) => {
    for (let j = 0; j < count; j++) {
      const n = sequence++, service = (n * 3 + monthIndex) % 4;
      const companyName = `${prefixes[n % prefixes.length]} ${suffixes[Math.floor(n / prefixes.length)]}`;
      const first = firstNames[n % firstNames.length];
      const date = new Date(Date.UTC(2026, monthIndex + 3, 1 + j % (monthIndex === 5 ? 9 : 24), 4 + j % 5));
      const coworking = service === 0;
      const openDesks = coworking ? 2 + n % 14 : 0, cabinDesks = coworking && n % 3 === 0 ? 2 + n % 7 : 0;
      result.leads.push({ _id: id('lead:' + n), company, companyName, serviceCategory: serviceIds[service], dateOfContact: date, leadStatus: ['Cold', 'Mild', 'Hot', 'Hot', 'Closed', 'Mild', 'Closed'][(n + monthIndex * 2) % 7], proposedLocations: [locations[(n + 2) % locations.length]._id.$oid, ...(n % 4 === 0 ? [locations[(n + 5) % locations.length]._id.$oid] : [])], sector: ['Technology', 'Consulting', 'Education', 'Finance', 'Retail', 'Design', 'Logistics'][n % 7], headOfficeLocation: cityPairs[n % 5][0], officeInGoa: n % 3 === 0, pocName: `${first} ${surnames[(n + 3) % 10]}`, designation: ['Founder', 'Operations Manager', 'Office Manager', 'Procurement Lead'][n % 4], contactNumber: '+91' + (9100000000 + n), emailAddress: `${first.toLowerCase()}@${companyName.toLowerCase().replace(/\s/g, '')}.com`, source: ['Website', 'Referral', 'Direct', 'LinkedIn', 'Broker'][n % 5], leadSource: ['Website enquiry', 'Client recommendation', 'Inbound call', 'LinkedIn outreach', 'Broker introduction'][n % 5], period: ['3 months', '6 months', '12 months'][n % 3], openDesks, cabinDesks, totalDesks: openDesks + cabinDesks, clientBudget: service === 0 ? (openDesks + cabinDesks) * (650 + n % 4 * 75) : service === 1 ? 450 + n % 6 * 100 : service === 2 ? 3500 + n % 8 * 500 : 150 + n % 6 * 75, startDate: new Date(+date + (7 + n % 14) * 86400000), remarksComments: `Discuss ${service === 0 ? 'workspace capacity and team seating' : service === 1 ? 'business address and mail handling' : service === 2 ? 'team retreat requirements' : 'meeting room availability'} with ${first}; ${n % 2 ? 'commercial proposal requested' : 'requirements review scheduled'}.`, lastFollowUpDate: date, createdAt: date, updatedAt: date });
    }
  });
  const roles = ['Facilities Coordinator', 'Talent Acquisition Specialist', 'Business Analyst', 'Frontend Engineer', 'Account Executive', 'Accounts Associate', 'IT Support Engineer', 'Office Administrator'];
  const skills = ['Vendor coordination and facility inspections', 'Candidate screening and interview coordination', 'Business reporting and stakeholder communication', 'React, JavaScript and accessibility testing', 'CRM management and consultative selling', 'Reconciliation, spreadsheets and invoicing', 'Network troubleshooting and endpoint support', 'Office coordination and inventory management'];
  for (let n = 0; n < 30; n++) {
    const first = firstNames[n], last = surnames[(n * 3) % 10], experience = 1 + n % 9;
    const date = new Date(Date.UTC(2026, 3 + n % 6, 1 + Math.floor(n / 6), 5));
    const salary = 650 + experience * 160 + n % 4 * 75;
    result.jobapplications.push({ _id: id('application:' + n), companyData: company, jobPosition: roles[n % 8], name: `${first} ${last}`, email: `${first.toLowerCase()}.${last.toLowerCase()}@outlook.com`, dateOfBirth: new Date(Date.UTC(1988 + n % 13, n % 12, 3 + n % 20)), mobileNumber: '+91' + (9200000000 + n), location: cityPairs[n % 5][0], experienceInYears: String(experience), currentMonthlySalary: String(salary), expectedMonthlySalary: String(Math.round(salary * (1.15 + n % 3 * 0.05))), howSoonYouCanJoinInDays: String([0, 15, 30, 45, 60][n % 5]), willRelocateToGoa: n % 4 ? 'Yes' : 'No', whoAreYouAsPerson: `${n % 2 ? 'Detail-oriented' : 'Collaborative'} professional with ${experience} years of experience in ${roles[n % 8].toLowerCase()} responsibilities.`, skillSetsForJob: skills[n % 8], whyShouldWeConsiderYou: `I bring hands-on experience in ${skills[n % 8].toLowerCase()} and focus on clear communication and timely delivery.`, willingToBootstrap: n % 5 ? 'Yes' : 'No', message: `Interested in the ${roles[n % 8]} opening; available for an interview ${n % 2 ? 'on weekday mornings' : 'on weekday afternoons'}.`, finalSubmissionDate: date, status: ['Pending', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected'][n % 5], remarks: ['Application awaiting initial review', 'Relevant experience matches the role', 'Technical discussion scheduled', 'Final discussion completed', 'Experience does not match current requirements'][n % 5] });
  }
  const specialities = ['Facility Services', 'Talent Partners', 'Business Advisory', 'Cloud Solutions', 'Sales Enablement', 'Accounting Services', 'Network Systems', 'Office Supplies'];
  departmentsIncluded.forEach((name, index) => {
    const department = departments.find(d => d.name === name); if (!department) throw new Error('Missing department: ' + name);
    for (let j = 0; j < 2 + index % 4; j++) {
      const n = index * 5 + j, business = `${prefixes[(index * 3 + j) % prefixes.length]} ${specialities[index]}`;
      const date = new Date(Date.UTC(2026, 3 + (index + j) % 6, 2 + j, 4));
      result.vendors.push({ _id: id('vendor:' + n), company, departmentId: department._id.$oid, name: `${firstNames[n % 30]} ${surnames[n % 10]}`, companyName: business, address: `${12 + n}, ${['Park Avenue', 'Lake Road', 'Station Road', 'Market Street'][j % 4]}, ${cityPairs[n % 5][0]}`, category: specialities[index], subCategory: ['Consulting', 'Supply and installation', 'Ongoing support', 'Annual maintenance', 'Managed services'][j], email: `${firstNames[n % 30].toLowerCase()}@${business.toLowerCase().replace(/\s/g, '')}.com`, mobile: '+91' + (9300000000 + n), status: j === 4 ? 'Inactive' : 'Active', onboardingDate: date, city: cityPairs[n % 5][0], state: cityPairs[n % 5][1], country: 'India', pinCode: ['400001', '411001', '560001', '403001', '110001'][n % 5], partyType: 'Company', createdAt: date, updatedAt: date });
    }
  });
  for (const [key, Model] of Object.entries(models)) result[key] = result[key].map(row => { const doc = new Model(row); const error = doc.validateSync(); if (error) throw error; return doc.toObject({ versionKey: false }); });
  return result;
}
if (require.main === module) {
  try {
    const { values } = require('node:util').parseArgs({ options: { source: { type: 'string' }, out: { type: 'string', default: 'pipeline-upload' } } });
    if (!values.source) throw new Error('--source is required');
    const load = k => JSON.parse(fs.readFileSync(path.join(values.source, `WonoUserData.${k}.json`), 'utf8'));
    const companies = load('companies'); if (companies.length !== 1) throw new Error('Provide one company');
    const data = build({ company: companies[0]._id.$oid, departments: load('departments'), units: load('units') });
    fs.mkdirSync(values.out);
    for (const [key, rows] of Object.entries(data)) fs.writeFileSync(path.join(values.out, key + '.json'), EJSON.stringify(rows, null, 2));
    console.table(Object.entries(data).map(([collection, rows]) => ({ collection, records: rows.length })));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { models, build, departmentsIncluded };
