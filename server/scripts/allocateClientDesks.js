function allocateClientDesks(clients, units, existing) {
  const states = units.filter(u => u.isActive !== false).map(unit => {
    const occupants = existing.filter(c => String(c.unit) === String(unit._id) && c.isActive !== false);
    const remaining = field => Math.max(0, Number(unit[field] || 0) - occupants.reduce((sum, c) => sum + Number(c[field] || 0), 0));
    return { unit, open: remaining('openDesks'), cabin: remaining('cabinDesks') };
  });
  const existingIds = new Set(existing.map(c => String(c._id)));
  const changes = [];
  const allocated = clients.map(client => {
    if (existingIds.has(String(client._id))) return client;
    const requested = Number(client.openDesks || 0) + Number(client.cabinDesks || 0);
    if (!Number.isInteger(requested) || requested < 1) throw new Error('Client must request a positive whole number of desks: ' + client.clientName);
    const candidates = [...states].sort((a, b) => Number(String(b.unit._id) === String(client.unit)) - Number(String(a.unit._id) === String(client.unit)));
    // Prefer retaining both the unit and requested desk types.
    const state = candidates.find(s => String(s.unit._id) === String(client.unit) && s.open >= client.openDesks && s.cabin >= client.cabinDesks)
      || candidates.find(s => s.open + s.cabin >= requested);
    if (!state) throw new Error(`Insufficient remaining capacity for ${client.clientName} (${requested} desks). Remaining by unit: ${states.map(s => `${s.unit.unitNo}: ${s.open} open, ${s.cabin} cabin`).join('; ')}`);
    let cabin = Math.min(Number(client.cabinDesks || 0), state.cabin);
    let open = requested - cabin;
    if (open > state.open) { cabin += open - state.open; open = state.open; }
    state.open -= open; state.cabin -= cabin;
    const result = { ...client, unit: state.unit._id, building: state.unit.building, openDesks: open, cabinDesks: cabin, totalDesks: requested, bookingType: cabin ? 'Private Office' : 'Dedicated Desk', totalMeetingCredits: requested * Number(client.perDeskMeetingCredits || 0), meetingCreditBalance: requested * Number(client.perDeskMeetingCredits || 0) };
    if (String(result.unit) !== String(client.unit) || open !== client.openDesks || cabin !== client.cabinDesks) changes.push({ client: client.clientName, unit: state.unit.unitNo, openDesks: open, cabinDesks: cabin });
    return result;
  });
  return { clients: allocated, changes };
}
module.exports = { allocateClientDesks };
