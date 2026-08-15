import { supabase } from './supabase';
import { readError, type AppError } from './errors';

/**
 * The spine of the product. Coach, seat, destination, college, year, hometown,
 * Instagram and phone live in tables no policy exposes; they come back only from
 * unlocked_profile(), and only once both people have independently asked.
 *
 * Asking is silent. The other person is never told you asked, or that you looked,
 * and there is deliberately no way to find out — so this module can never learn
 * whether they asked either, only whether it has become mutual.
 */
export type Unlocked = {
  college: string | null;
  study_year: string | null;
  hometown: string | null;
  instagram: string | null;
  phone: string | null;
  coach: string | null;
  seat: string | null;
  to_station: string | null;
};

export type UnlockState = {
  iAsked: boolean;
  mutual: boolean;
};

/**
 * Goes through unlock_state() rather than reading the unlocks table, because the
 * table is no longer readable by clients at all (schema.sql §18). It used to be,
 * and a modified client could then see that the other person had asked — which is
 * the one thing this feature promises never happens. Now the only facts that
 * cross the wire are whether you asked and whether it is mutual.
 */
export async function unlockState(
  other: string,
  service: string,
  date: string,
): Promise<UnlockState> {
  const { data, error } = await supabase.rpc('unlock_state', {
    other,
    p_service: service,
    p_date: date,
  });
  const row = (data as { i_asked: boolean; mutual: boolean }[] | null)?.[0];
  if (error || !row) return { iAsked: false, mutual: false };
  return { iAsked: row.i_asked, mutual: row.mutual };
}

export async function askUnlock(other: string, service: string, date: string) {
  const { data, error } = await supabase.rpc('ask_unlock', {
    other,
    p_service: service,
    p_date: date,
  });
  if (error) return { ok: false as const, error: readError(error) as AppError };
  return { ok: true as const, mutual: data === true };
}

/** Returns nothing at all unless both people asked. */
export async function loadUnlocked(other: string) {
  const { data, error } = await supabase.rpc('unlocked_profile', { other });
  if (error) return { ok: false as const, error: readError(error) as AppError };
  const row = (data as Unlocked[] | null)?.[0] ?? null;
  return { ok: true as const, profile: row };
}
