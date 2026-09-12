function memberContacts(name, clientName, index) {
  const firstName = name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  const companyName = clientName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return { email: `${firstName}@${companyName}.com`, mobileNo: `+91${9000000000 + index}` };
}
module.exports = { memberContacts };
