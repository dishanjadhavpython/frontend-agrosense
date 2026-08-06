/**
 * Formatting for an Indian audience.
 *
 * Rupees group in lakh/crore, not thousands: ₹4,72,000 — never ₹472,000.
 * Land is measured in acres and gunthas, produce in quintals. Never hectares.
 */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrNum = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹4,72,000 */
export function rupees(value: number) {
  return inr.format(value);
}

/** 4,72,000 — when the ₹ sits in a separate label */
export function indianNumber(value: number) {
  return inrNum.format(value);
}

/** ₹4,720/qtl */
export function perQuintal(value: number) {
  return `${inr.format(value)}/qtl`;
}

/** ₹18,400/acre */
export function perAcre(value: number) {
  return `${inr.format(value)}/acre`;
}

/** +₹120 / −₹80 — always signed, for day-on-day price moves */
export function signedRupees(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${inr.format(Math.abs(value))}`;
}

/** +2.4% / −1.1% */
export function signedPercent(value: number, digits = 1) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/**
 * 1 acre = 40 guntha. Farmers hold odd parcels, so show the remainder.
 *
 * Figures stay in Latin digits — that's how they're printed on a 7/12 extract
 * and on the Soil Health Card — but the unit words follow the reading
 * language. "2 acre 20 guntha" on a Marathi page reads as someone else's app.
 */
export function acresGuntha(acres: number, lang: "mr" | "en" = "en") {
  const u =
    lang === "mr"
      ? { acre: "एकर", guntha: "गुंठा" }
      : { acre: "acre", guntha: "guntha" };

  const whole = Math.floor(acres);
  const guntha = Math.round((acres - whole) * 40);

  if (guntha === 0) return `${whole} ${u.acre}`;
  if (whole === 0) return `${guntha} ${u.guntha}`;
  return `${whole} ${u.acre} ${guntha} ${u.guntha}`;
}

/** 12 Jun 2026 */
export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** 12 Jun */
export function dayMonth(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

/** 4:05 pm */
export function clockTime(iso: string) {
  return new Date(iso)
    .toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
