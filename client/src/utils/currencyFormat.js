// export const inrFormat = (money) => {
//   return Number(money).toLocaleString("en-US", {
//     maximumFractionDigits: 0,
//   });
// };

export const inrFormat = (money) => {
  const exchangeRate = 83; // 1 USD = 83 INR
  const usdValue = Math.ceil(Number(money) / exchangeRate); // Round up
  return usdValue.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
};
