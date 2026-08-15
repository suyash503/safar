import { supabase } from './supabase';
import { readError, type AppError } from './errors';
import { istInstant, istMinutesNow, istToday, shiftDays, toMinutes } from './time';
import { isOvernight, type Service } from '../data/services';

/**
 * Which day's run of this service you are on.
 *
 * The question the app has to answer is not "what is today" but "which departure
 * am I sitting on". At 06:00, still aboard the Lucknow Mail, the answer is
 * yesterday's departure — everyone else in that coach added it last night.
 */
export function serviceDate(service: Service, now: Date = new Date()) {
  const today = istToday(now);
  if (!isOvernight(service)) return today;
  // Before this morning's arrival, the train that is running left yesterday.
  return istMinutesNow(now) < toMinutes(service.arrives) ? shiftDays(today, -1) : today;
}

/** Scheduled arrival + 24h, which is what journeys.expires_at means. */
export function expiresAt(service: Service, travelDate: string) {
  const arrivalDay = isOvernight(service) ? shiftDays(travelDate, 1) : travelDate;
  const arrival = istInstant(arrivalDay, service.arrives);
  return new Date(arrival.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export type AddResult = { ok: true } | { ok: false; error: AppError };

export async function addJourney(service: Service, travelDate: string): Promise<AddResult> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, error: { message: 'You are signed out.', route: 'none' } };

  const { error } = await supabase.from('journeys').insert({
    user_id: user.user.id,
    mode: 'train',
    service_code: service.code,
    travel_date: travelDate,
    from_station: service.from,
    expires_at: expiresAt(service, travelDate),
  });

  const app = readError(error);
  return app ? { ok: false, error: app } : { ok: true };
}
