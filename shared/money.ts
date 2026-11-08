// Money is integer minor units plus an ISO 4217 code. These helpers are shared
// by the UI and actions so both agree on how many minor digits a currency has.

export function isIsoCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.("currency");
  return supported ? supported.includes(code) : true;
}

export function minorDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** 150000 NGN -> "₦1,500.00" (locale-aware). */
export function formatMoney(
  minor: number | null | undefined,
  currency: string,
  locale?: string,
): string {
  if (minor === null || minor === undefined) return "—";
  const digits = minorDigits(currency);
  const major = minor / 10 ** digits;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      // "₦1,500" rather than "NGN 1,500".
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: Number.isInteger(major) ? 0 : digits,
      maximumFractionDigits: digits,
    }).format(major);
  } catch {
    return `${major.toFixed(digits)} ${currency}`;
  }
}

/** "1500" or "1,500.50" (major units) -> minor units, or null when invalid. */
export function parseMajorToMinor(
  input: string,
  currency: string,
): number | null {
  const cleaned = input.replace(/[\s,_]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const digits = minorDigits(currency);
  return Math.round(Number(cleaned) * 10 ** digits);
}

export function minorToMajorString(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  const major = minor / 10 ** digits;
  return Number.isInteger(major) ? String(major) : major.toFixed(digits);
}
