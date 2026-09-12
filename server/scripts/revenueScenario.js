const { createHash } = require('node:crypto');
const round = n => Math.round(n * 100) / 100;
// Illustrative USD pricing; tax proportions mirror the supplied historical
// exports. These are generated scenario values, not converted company revenue.
function applyRevenueScenario(result, clients) {
  const clientRateUpdates = clients.coworkingclients.map((client, index) => ({
    _id: client._id, company: client.company,
    ratePerOpenDesk: [650, 725, 800, 875, 950, 1050][index % 6],
    ratePerCabinDesk: [1050, 1150, 1250, 1350, 1450, 1550][index % 6],
  }));
  for (const row of result.coworkingclientrevenues) {
    const index = clients.coworkingclients.findIndex(c => String(c._id) === String(row.clients));
    const client = clients.coworkingclients[index], rates = clientRateUpdates[index];
    row.noOfDesks = Number(client.openDesks || 0) + Number(client.cabinDesks || 0);
    row.revenue = round(Number(client.openDesks || 0) * rates.ratePerOpenDesk + Number(client.cabinDesks || 0) * rates.ratePerCabinDesk);
    row.deskRate = round(row.revenue / row.noOfDesks);
  }
  for (const row of result.virtualofficerevenues) {
    const index = clients.virtualofficeclients.findIndex(c => String(c._id) === String(row.client));
    row.taxableAmount = [450, 575, 650, 775, 850, 975][index % 6];
    row.revenue = round(row.taxableAmount * 1.18);
    // The source uses rentStatus for the contract state, status for payment.
    row.rentStatus = 'Active';
  }
  result.workationrevenues = result.workationrevenues.flatMap(row => {
    const index = clients.workationclients.findIndex(c => String(c._id) === String(row.client));
    const month = new Date(row.date).getUTCMonth() - 3;
    return ['Cab Services', 'Food and beverages', 'Event Management Services'].map((particulars, line) => {
      const taxableAmount = [1200, 1800, 3200][line] + (index % 5) * [180, 260, 450][line] + month * [40, 65, 110][line];
      const gst = round(taxableAmount * 0.18);
      return { ...row, _id: line === 0 ? row._id : createHash('sha256').update(`revenue-scenario:${row._id}:${line}`).digest('hex').slice(0, 24), particulars, taxableAmount, gst, totalAmount: round(taxableAmount + gst) };
    });
  });
  for (const row of result.alternaterevenues) {
    const line = ['Printing and document services', 'Event equipment rental', 'Business workshop', 'Storage locker subscription'].indexOf(row.particulars);
    if (line < 0) throw new Error('Unknown alternate billing scenario');
    const month = new Date(row.invoiceCreationDate).getUTCMonth() - 3;
    row.particulars = ['Parking Charges', 'Centre Management Fees', 'Monthly Pass', 'Parking'][line];
    row.taxableAmount = [1800, 6500, 3200, 1200][line] + month * [95, 275, 160, 80][line];
    row.gst = round(row.taxableAmount * 0.18);
    row.invoiceAmount = round(row.taxableAmount + row.gst);
  }
  return clientRateUpdates;
}
module.exports = { applyRevenueScenario };
