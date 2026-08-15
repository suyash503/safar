import { supabase } from './supabase';
import { readError, type AppError } from './errors';

/** Everything a stranger on your train can see. */
export type PublicProfile = {
  first_name: string;
  photo_url: string | null;
  bio: string;
  tags: string[];
};

/**
 * The locked half. These columns live in profile_private, which no RLS policy
 * exposes — they come back only through unlocked_profile(), and only once both
 * people have asked. Editing them here is safe because the policy is owner-only.
 */
export type PrivateProfile = {
  college: string;
  study_year: string;
  hometown: string;
  instagram: string;
  phone: string;
};

// Mirrors the CHECK constraints in schema.sql §1. The database is still the
// authority; these exist so the form can say no before a round trip.
export const LIMITS = { firstName: 24, bio: 140, tags: 5 } as const;

/** null in the database and '' in a text input are the same thing to a person. */
const text = (v: string | null | undefined) => v ?? '';
const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

export async function loadProfile(): Promise<
  { ok: true; pub: PublicProfile; priv: PrivateProfile } | { ok: false; error: AppError }
> {
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) return { ok: false, error: { message: 'You are signed out.', route: 'none' } };

  const [pubRow, privRow] = await Promise.all([
    supabase.from('profiles').select('first_name, photo_url, bio, tags').eq('id', me.user.id).single(),
    supabase
      .from('profile_private')
      .select('college, study_year, hometown, instagram, phone')
      .eq('id', me.user.id)
      .single(),
  ]);

  const error = pubRow.error ?? privRow.error;
  if (error) return { ok: false, error: readError(error)! };
  if (!pubRow.data || !privRow.data) {
    // Both halves are created with the account (§17), so this means something
    // is wrong with the account rather than with this screen.
    return { ok: false, error: { message: 'Your profile is missing.', route: 'none' } };
  }

  return {
    ok: true,
    pub: {
      first_name: text(pubRow.data.first_name),
      photo_url: pubRow.data.photo_url,
      bio: text(pubRow.data.bio),
      tags: pubRow.data.tags ?? [],
    },
    priv: {
      college: text(privRow.data.college),
      study_year: text(privRow.data.study_year),
      hometown: text(privRow.data.hometown),
      instagram: text(privRow.data.instagram),
      phone: text(privRow.data.phone),
    },
  };
}

export async function saveProfile(pub: PublicProfile, priv: PrivateProfile) {
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) return { message: 'You are signed out.', route: 'none' } as AppError;

  const first = pub.first_name.trim();
  if (first.length < 1 || first.length > LIMITS.firstName) {
    return { message: `A first name is 1 to ${LIMITS.firstName} characters.`, route: 'none' } as AppError;
  }

  const pubResult = await supabase
    .from('profiles')
    .update({
      first_name: first,
      bio: orNull(pub.bio),
      tags: pub.tags.slice(0, LIMITS.tags),
    })
    .eq('id', me.user.id);
  if (pubResult.error) return readError(pubResult.error);

  const privResult = await supabase
    .from('profile_private')
    .update({
      college: orNull(priv.college),
      study_year: orNull(priv.study_year),
      hometown: orNull(priv.hometown),
      instagram: orNull(priv.instagram),
      phone: orNull(priv.phone),
    })
    .eq('id', me.user.id);
  if (privResult.error) return readError(privResult.error);

  return null;
}
