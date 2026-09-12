const roomNames = ['Cedar', 'Maple', 'Orchid', 'Horizon', 'Coral', 'Summit', 'Aurora', 'Willow', 'Juniper', 'Sapphire', 'Aspen', 'Solstice', 'Meridian'];
function presentation(data) {
  data.rooms.forEach((room, index) => { room.name = roomNames[index] || `Conference Suite ${index + 1}`; });
  for (const key of ['visitors', 'externalvisits']) for (const row of data[key]) {
    const client = ['Meeting', 'Full-Day Pass', 'Half-Day Pass'].includes(row.visitorType);
    row.visitorFlag = client ? 'Client' : 'Visitor';
    row.visitorRoles = [row.visitorFlag];
    if (key === 'visitors' && client) {
      row.registeredClientCompany = row.visitorCompany;
      row.brandName = row.visitorCompany;
    }
    if (row.idProof) row.idProof.idType = 'Reference';
  }
  return data;
}
module.exports = { presentation };
