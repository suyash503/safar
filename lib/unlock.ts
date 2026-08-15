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

export async function unlockState(
  other: string,
  service: string,
  date: string,
): Promise<UnlockState> {
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) return { iAsked: false, mutual: false };

  const [lo, hi] = [me.user.id, other].sort();
  const { data } = await supabase
    .from('unlocks')
    .select('a_id, a_asked, b_asked')
    .eq('a_id', lo)
    .eq('b_id', hi)
    .eq('service_code', service)
    .eq('travel_date', date)
    .maybeSingle();

  if (!data) return { iAsked: false, mutual: false };
  const iAsked = me.user.id === data.a_id ? data.a_asked : data.b_asked;
  return { iAsked, mutual: data.a_asked && data.b_asked };
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
