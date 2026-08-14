# Safar

An app for people travelling alone on Indian trains, mostly students going between
home and college. You add the train you're already on and you can see the handful of
other people on that same service who are up for talking.

Everything is scoped to the journey. Chats disappear nine hours after the last message,
so nobody has an inbox to maintain and nobody owes anyone a reply.

Starting on the Lucknow–Delhi corridor.

## Where this is at

Not shippable. What exists so far:

- `index.html` — clickable prototype, self-contained, just open it in a browser
- `backend/schema.sql` — Postgres schema, running on Supabase
- `NOTES.md` — decisions and the reasoning behind them

The Android app isn't built yet.

## Privacy

This is the part I care about most.

Anyone on your train sees your first name, one photo, and two lines you wrote yourself.
Coach and seat, college, where you're getting off, Instagram — all hidden until you
*both* tap unlock. Asking doesn't notify the other person or tell them you looked.

It's enforced in the database rather than the app. The private columns sit in tables
that no row-level policy exposes, and only come back through a function that checks
both people agreed. So a modified client can't get at them either.

Blocks are the one thing that never expires. If you blocked someone in August they're
still invisible in December, long after everything else about that journey is gone.

## Running the backend

Make a new Supabase project, paste `backend/schema.sql` into the SQL editor and run it.
The sections are ordered, so top to bottom works.

Then turn on `pg_cron` under Database → Extensions and schedule the cleanup:

```sql
select cron.schedule('safar-sweep', '0 * * * *', $$ select public.sweep_expired(); $$);
```

Expiry is enforced by the policies as well, so a late sweep doesn't leak anything —
it just means dead rows sit around until it runs.

In the project's Data API settings, turn **off** "automatically expose new tables" and
turn **on** automatic RLS. Section 14 of the schema grants API access explicitly.

## Stack

- Supabase — Postgres, auth, realtime, storage
- Expo / React Native (not started)
- Google sign-in, no passwords or OTP
- Train timetables from [data.gov.in](https://www.data.gov.in/catalog/indian-railways-train-time-table),
  bundled with the app so the halt guide works with no signal

Offline-first, because this route loses signal for about forty minutes past Etawah and
an app that waits on a server there looks broken.

## Fonts

Display face is **Jangkuy** by Azkia Fadhlan ([@yukkazzu](https://www.behance.net/azkiamfadhlan))
under [Atas Creative Project](https://www.behance.net/atascreativeproject). Free for
personal and commercial use — licence included in `fonts/`.
