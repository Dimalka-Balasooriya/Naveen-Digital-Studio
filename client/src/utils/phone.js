// Accept ordinary local/international phone formatting, never dial codes or URLs.
// This validates syntax only; it cannot establish whether a number is in service.
export function phoneHref(value) {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(input)) return null;
  const number = input.replace(/[\s().-]/g, '');
  const digits = number.replace(/^\+/, '');
  if (!/^\d{7,15}$/.test(digits) || /^0+$/.test(digits)) return null;
  if (number.startsWith('+') && digits.startsWith('0')) return null;
  return `tel:${number}`;
}
