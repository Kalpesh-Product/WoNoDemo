// Amounts passed to this formatter are already denominated in USD.
export const usdFormat = (money) =>
  Number(money).toLocaleString("en-US", { maximumFractionDigits: 0 });
