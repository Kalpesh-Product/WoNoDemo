export const inrFormat = (money) => {
  const exchangeRate = 83; // 1 USD = 83 USD
  const usdValue = Math.ceil(Number(money) / exchangeRate); // Round up
  return usdValue.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
};
