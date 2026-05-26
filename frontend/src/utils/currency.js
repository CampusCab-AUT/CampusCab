/**
 * Formats a numeric amount as a New Zealand Dollar string (e.g. "$5.00").
 * Returns an empty string for null, undefined, empty input, non-finite, or negative values
 * so callers can render nothing for "no contribution" without extra guards.
 *
 * @param {number|string|null|undefined} amount - The amount to format.
 * @returns {string} Formatted currency string, or '' for invalid/missing input.
 */
export const formatNZD = (amount) => {
  if (amount === null || amount === undefined || amount === '') return '';
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return '';
  return `$${n.toFixed(2)}`;
};
