export const isStatutoryPayment = (budget) =>
  /^statutory(?:\s+payments)?$/i.test(String(budget?.expanseType || "").trim());
