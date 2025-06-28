export const inrFormat = (money) => {
  const exchangeRate = 100; // 1 USD = 100 INR  
const usdValue = Math.ceil(Number(money) / exchangeRate); // Round up
  return usdValue.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
};
