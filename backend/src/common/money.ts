/** Money is integer paise everywhere; this is only for words shown to people. */
export const formatRupees = (paise: number): string =>
  `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: paise % 100 === 0 ? 0 : 2 })}`;
