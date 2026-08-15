import type { PostgrestError } from '@supabase/supabase-js';

/**
 * The database is where the rules live, so the app's job is to read its
 * exceptions rather than duplicate the checks. schema.sql §17 raises these from
 * the trigger on journeys — inserting a journey fails outright until dob is set
 * and the user is 18 or over.
 *
 * `route` tells the caller where to send the user. 'age' means back to the date
 * of birth screen; 'blocked' means there is nothing to do but explain.
 */
export type AppError = {
  message: string;
  route: 'age' | 'blocked' | 'none';
};

const NO_DOB = 'set your date of birth before adding a journey';
const UNDER_18 = 'Safar is only for people over 18';

export function readError(error: PostgrestError | Error | null): AppError | null {
  if (!error) return null;
  const raw = error.message ?? '';

  if (raw.includes(NO_DOB)) {
    return { message: 'Add your date of birth first.', route: 'age' };
  }
  if (raw.includes(UNDER_18)) {
    return { message: UNDER_18 + '.', route: 'blocked' };
  }
  if (raw.includes('new accounts can start three conversations per journey')) {
    return {
      message: 'New accounts can start three conversations a journey. Yours resets next trip.',
      route: 'none',
    };
  }
  if (raw.includes('links are not allowed until you have travelled a few times')) {
    return { message: 'Links are off until you have travelled a few times.', route: 'none' };
  }
  if (raw.includes('not on the same journey')) {
    return { message: 'That person is no longer on this train.', route: 'none' };
  }
  // journeys is unique on (user_id, service_code, travel_date).
  if (raw.includes('duplicate key value') || (error as PostgrestError).code === '23505') {
    return { message: 'You are already on this train.', route: 'none' };
  }

  // Offline is the normal case on this route, not an error worth alarming about.
  // Android words this as UnknownHostException rather than anything resembling
  // "network error", which is how three messages once ended up marked as failed
  // for the offence of being written in a tunnel.
  if (
    raw.includes('Network request failed') ||
    raw.includes('Failed to fetch') ||
    raw.includes('UnknownHostException') ||
    raw.includes('Unable to resolve host') ||
    raw.includes('fetch failed') ||
    raw.includes('timed out')
  ) {
    return { message: 'No signal. This will send itself when you are back.', route: 'none' };
  }

  return { message: 'Something went wrong. Try again.', route: 'none' };
}
