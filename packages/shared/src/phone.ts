import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

export interface NormalizedPhone {
  e164: string;
  national: string;
  country: string | undefined;
}

/**
 * Validate a phone number against the store's country and return it in E.164.
 * Returns null when the number is not valid for that country.
 */
export function normalizePhone(input: string, country: string): NormalizedPhone | null {
  const cleaned = input.replace(/[^\d+]/g, '');
  if (cleaned.length < 6) return null;
  const parsed = parsePhoneNumberFromString(cleaned, country as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  return { e164: parsed.number, national: parsed.formatNational(), country: parsed.country };
}

export function isValidPhone(input: string, country: string): boolean {
  return normalizePhone(input, country) !== null;
}

