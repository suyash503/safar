// Every date in this app is an Indian date. India is UTC+5:30 with no daylight
// saving, so a fixed offset is exact — no timezone database, no Intl, nothing
// that varies by device.
//
// This exists because `new Date().toISOString()` is UTC, and on the reference
// train (22:00 → 06:35) that puts the people who board at night and the people
// who check their phone at dawn on two different dates. onboard_list() matches
// on service_code AND travel_date, so those two groups would never see each
// other — one train, split in half, silently.

const IST_OFFSET_MIN = 330;
const DAY_MS = 86_400_000;

/** A Date whose UTC fields read as Indian local time. Never send this to the server. */
function asIst(now: Date) {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
}

/** Today's date in India, as YYYY-MM-DD. */
export function istToday(now: Date = new Date()) {
  return asIst(now).toISOString().slice(0, 10);
}

/** Minutes since midnight, in India. */
export function istMinutesNow(now: Date = new Date()) {
  const d = asIst(now);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function shiftDays(iso: string, days: number) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10);
}

/** "22:00" → 1320 */
export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Turn an Indian date and clock time into a real instant (UTC), for columns like
 * expires_at that are timestamptz.
 */
export function istInstant(isoDate: string, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const asIfUtc = Date.parse(`${isoDate}T00:00:00Z`) + (h * 60 + m) * 60_000;
  return new Date(asIfUtc - IST_OFFSET_MIN * 60_000);
}
