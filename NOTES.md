# Notes

Decisions, and why. Mostly so I don't relitigate the same arguments with myself in
three weeks. Also lists what's deliberately been ruled out, which turns out to matter
more than the list of what's in.

---

## What it is

A mobile app for **Indian college students travelling alone** — first and second years
going between home and college, who don't know anyone on the train and find the journey
long and boring.

You add the train you're already on. You see the handful of people on that exact
service who've opted in. Wave, chat, meet at a halt. **When the journey ends, so does
everything** — unless you both chose otherwise.

**Route for launch:** Lucknow ⇄ Delhi, and every station between (Kanpur, Etawah,
Tundla, Aligarh, Ghaziabad). Reference train throughout: **12229 Lucknow Mail**,
LKO 22:00 → NDLS 06:35.

**Audience note that drives everything:** the target user is lonely, not bored. Design
and marketing should lead with boredom anyway — nobody installs an app that tells them
they have no friends.

---

## Current state

| Piece | Status |
|---|---|
| Clickable prototype (6 modes) | **Done** — `index.html` |
| Product & design decisions | **Done** — see below |
| Database schema | **Done** — 18 sections; §17 and §18 applied 2026-08-15, both verified from the app |
| `pg_cron` sweep | **Done** — `safar-sweep`, hourly |
| Google OAuth — web client | **Done** in Google Console + Supabase |
| Google OAuth — Android client | **Deferred** (needs a build for the SHA-1) |
| Expo app | **Runs on a real device** — SDK 57, expo-router |
| Google Sign-In in the app | **Working end to end**, verified on a Redmi Note 12 |
| Privacy policy / Play Data Safety | Not started |

**Verified state of the database** (re-run any time to confirm nothing drifted):

```
tables 11 · rls enabled 11 · policies 15 · triggers 4 · auth hook 1
ANON GRANTS 0 · authenticated tables 11 · cron job safar-sweep active
```

`ANON GRANTS 0` is the important one — an unauthenticated client can reach nothing.

**Verified from a real signed-in browser session**, all six passing:

1. Google sign-in returns a session
2. `handle_new_user` creates the profile row with name and photo from Google
3. RLS isolation — one visible profile, your own, since you share no journey
4. `profile_private` readable only by its owner
5. `onboard_list()` RPC callable
6. Anonymous client rejected outright

Kept locally as `test-auth.html` (gitignored — it holds project keys in browser
storage). Worth re-running after any schema change.

**Gotcha that cost an hour:** an RLS policy is evaluated as the *querying* role, so
`authenticated` needs EXECUTE on every function a policy calls. `SECURITY DEFINER`
governs what the body may do once running — it does not grant the right to call it.
Section 16 fixes this for `shares_journey` and `is_blocked_with`. Add the grant in the
same breath as any future policy that calls a helper.

---

## The age gate — fixed and verified from the app

**The project now lives at `C:\dev\safar`**, not in OneDrive. The OneDrive copy is
stale; treat it as a backup and delete it.

On 2026-08-15 a signed-in account inserted a journey that should have been refused.
Cause: `journeys_adult` was **not in the live database** — `pg_trigger` listed only
`journeys_bump`. Section 17 had been committed and written up as verified, but never
actually run. Re-running §17 created it.

A second thing hid the first: both test accounts already had a `dob`, because before
§17 the column was `NOT NULL` and every row created during backend testing carried a
real date. So even with the trigger present, nothing would have been blocked. Clearing
`dob` was needed to see the gate work at all.

**Now verified from the phone, in order:** sign in → tap add journey → refused → age
screen → under-18 refused → valid date saved → journey accepted.

**Two-person test passed, 2026-08-15.** Two accounts on 12229, same travel_date, each
sees the other on Onboard with the name and photo Google supplied. First time
`onboard_list()` has returned a row, and the first time the product did the thing it
exists to do. The RLS rule that you must be on a service to see anyone on it held.

**The lesson worth keeping:** "verified" in this file meant a check that passed once,
against a database state nobody re-read afterwards. The six checks in `test-auth.html`
carry exactly the same risk. A claim about the live database is only worth what its
last re-run is worth.

## Chat — working, offline included, verified on the phone

Sent with signal, and sent in aeroplane mode then delivered on reconnect without
anyone tapping anything. `lib/outbox.ts`, `lib/chat.ts`, `app/chat/[id].tsx`.

Still not run, and optional — without it the screen refetches instead of updating live,
which is why nothing depends on it:

```sql
alter publication supabase_realtime add table public.messages;
```

**Four bugs came out of this, and three share a shape.**

1. `thread_members_self` was a subquery over `thread_members`, so Postgres re-entered
   the policy to answer its own question: `42P17, infinite recursion`. It failed every
   message insert, since `messages_send` checks membership through that table. Fixed in
   `schema.sql` and applied live.
2. **Nothing woke the queue when signal returned.** `flush()` ran on send, on chat open
   and on Onboard load — so sitting on the chat screen through a tunnel meant waiting
   until you happened to navigate. `startOutboxPump()` now listens for connectivity,
   for the app returning to the foreground, and ticks slowly as a backstop.
3. **Offline was detected by matching error text**, and Android words it
   `java.net.UnknownHostException: Unable to resolve host` — nothing like the
   "Network request failed" being matched. Every offline message was therefore treated
   as an unknown failure and burned an attempt. `flush()` now asks NetInfo whether
   there is a network instead of inferring it, and the text match is a fallback.
4. **A delivered message vanished from the screen.** It leaves the outbox, so its
   pending bubble disappears, and the chat only fetched on mount — the message sat safe
   in the database while the sender watched it evaporate. `onDelivered()` now triggers
   a refetch.

Two, three and four are all the same mistake: inferring a fact that could have been
asked for directly. Same shape as computing `travel_date` from UTC.

## Sign-in survives having the app killed

MIUI kills backgrounded apps aggressively, and the browser step of Google sign-in
backgrounds Safar every time. On a Redmi Note 12 this took **four attempts**, with the
log showing four `Running "main"` — four process deaths, one lucky survivor.

It looked like an OS problem and was ours. The root layout used to swap the `<Stack>`
out for a spinner while the session loaded, so on a cold start there was no navigator
for the first few hundred milliseconds — and a cold start is exactly how the app comes
back when it was killed mid sign-in. The `safar://auth/callback` deep link arrived with
nowhere to go and was dropped, along with a perfectly good one-time code. The spinner is
now painted **over** the navigator instead of replacing it.

**Tested deliberately**: force-stopped the app while the Google account picker was open,
then picked an account. One cold start, no errors, straight to Onboard.

Xiaomi is a large share of the Indian student market, so this was not an edge case —
it was most of the first-run experience for a lot of people.

Still worth doing, both phone-side: Battery saver → No restrictions for Safar, and the
lock icon in Recents.

## Unlock silence — enforced, and tested from both sides

§18 applied 2026-08-15. Tested on the phone: account A asked, account B opened the same
chat and saw a plain first-time **Ask to unlock** with no hint whatsoever, then asked and
it opened for both. The promise now holds because the fact never leaves the database,
not because the client is well behaved.

**What §18 was for.** `unlocks` had been granted SELECT to `authenticated` with a policy
letting *either* party read the row, and the row holds `a_asked` and `b_asked` as
separate columns — so a modified client could see that the other person had asked,
before asking, or without ever asking. The app only derived "mutual" from it, so nothing
looked wrong. That is the client being polite about a fact the server handed it. §18
revokes the grant and replaces it with `unlock_state()`, which returns only whether *you*
asked and whether it is mutual.

**Found by trying to test the promise rather than trusting it.** The same is true of the
age gate and the realtime publication. It is now the single most reliable way this
project finds real bugs.

## Open problems

**The timetable is one train.** `data/services.ts` holds only 12229, with times
taken from this file. The rest of the corridor has to be imported from
data.gov.in. Times were deliberately not written from memory — a wrong departure
puts a real person on the wrong platform, and being right offline is the entire
reason the timetable is bundled rather than fetched.

~~`travel_date` computed in UTC~~ — **fixed.** `lib/time.ts` does every date at a
fixed +5:30 (India has no daylight saving, so the offset is exact), and
`serviceDate()` in `lib/journey.ts` answers *which departure you are on* rather
than what today is: before this morning's arrival on an overnight service, the
train running left yesterday. `expiresAt()` is now scheduled arrival + 24h, as the
column always meant.

**An under-18 date of birth is a dead end.** `app/age.tsx` now refuses under-18 before
saving, but if one is ever stored, Onboard shows the red rejection and there is no
route back to the age screen and no way to reach a human. Correct for a genuine
under-18 user; unrecoverable for a typo. Decide before real users.

## How to run the app

```
cd C:\dev\safar
npx expo start          # then the app on the phone reloads from the laptop
```

The debug build is already installed on the device. Rebuild only when native code
or `app.json` changes: `npx expo run:android`.

**Windows things that cost hours, all now fixed:**

- **`android/local.properties` is pinned to `sdk.dir=C\:\\Android\\Sdk`** — the junction,
  not the real path. It is gitignored, so a fresh clone must recreate it, and a rebuild
  without it drags the spaced path back in through a stale CMake cache.
- **A space in the Windows username breaks the NDK.** `clang++.cmd` gets 8.3-mangled
  to `CLANG_~1.CMD`, the wrapper loses the `++`, links as C, and every libc++ symbol
  comes back undefined. Fixed with a junction: `C:\Android\Sdk` → the real SDK, and
  `ANDROID_HOME` points at the junction. **This is the one that will come back** if
  the SDK path is ever set back to the `C:\Users\Suyash Singh\...` original.
- **Gradle's daemon would not start** — `AppData\Local\Temp` rejects AF_UNIX sockets,
  which JDK 17 uses for the pipes behind every `Selector`. Fixed by pointing
  `TMP`/`TEMP` at `C:\Users\Suyash Singh\.gradle-tmp`. Not yet made permanent.
- `react-dom` must be pinned to `19.2.3` to match React, or a clean `npm install`
  fails outright.

## The core mechanic — mutual unlock

This is the spine. Everything else hangs off it.

**Visible to anyone on your train:** first name, one photo, two self-written lines,
up to five tags, whether you're open to talking.

**Locked until BOTH people tap unlock:** coach and seat, college and year, destination,
Instagram/phone, hometown.

Asking to unlock is **silent** — the other person is never told you asked, or that you
looked. It opens only when they independently ask too, and then both sides get all five
fields at the same moment.

Enforced in Postgres, not the client: private fields live in `profile_private` and the
coach/seat columns of `journeys`, which **no RLS policy exposes**. They are returned only
by `unlocked_profile()`, which checks mutuality. *Locked means never sent, not hidden
after sending.*

---

## Settled decisions

| Decision | Why |
|---|---|
| **Chats die** 9h after the last message | Ephemerality is what makes strangers relax. Keyed to conversation, not timetable — so a 4h delay breaks nothing, and no live train API is needed |
| **Journeys** expire 24h after arrival | Storage plateaus instead of growing |
| **Blocks are permanent** | Everything else can vanish; if you blocked someone in August they stay invisible in December |
| **Sign-up = Google, two taps** | No password, no SMS OTP (costs money), no college email |
| **Hard 18+ gate**, self-declared DOB | Accepted as unverifiable for now |
| **English only** | Scope call. Hindi was cut along with the language picker |
| **Offline-first** | Trains lose signal ~40 min past Etawah. Writes land locally, sync later, every message carries a device `client_id` for idempotency |
| **Tickets NOT verified** | No free PNR API exists. Rate limits carry that weight instead |
| **No fake users, ever** | On a train people can look around and count. One invented profile ends the product |
| **Group-first (Adda)** | Strongest defence against drifting into a dating app |
| **Trains and buses only** | No flights, no stays |
| **Women-only mode: rejected** | User's call. Revisit if women's signup lags — that's the canary |

### Deliberately rejected
- Swiping, distance ranking, looks ranking
- Seeded/fake profiles
- Notifications on an empty train (exactly **one** is allowed: when a second person joins)
- Live train tracking (unnecessary by design, and not free)

---

## Safety model

Three pillars, since ticket verification was dropped:

1. **Mutual unlock** — nothing identifying escapes without both parties
2. **One-tap block** — instant, permanent, bidirectional, silent
3. **Automatic report thresholds** — no human on duty at 3am

**Report flow:** reasons are buttons not a text box (nobody writes an essay at 3am),
includes "Following me around the train". One report hides that person permanently both
ways. Three distinct reporters, or one report against an account with <3 journeys →
suspended automatically.

**The train-specific rule:** never tell the reported person during the journey. On a
dating app they can't reach you; on the Lucknow Mail they're 20 metres away for six more
hours. Hiding is silent and mutual — it looks like the other person simply left.

**Rate limits (replacing verification):** new accounts (<3 journeys) get 3 conversations
per journey and cannot send links. Both enforced in the database — a limit the client
enforces is a limit a modified client ignores.

**Helpline numbers in the prototype (139, 112) are UNVERIFIED. Confirm before shipping.**

---

## Cold start — the thing most likely to kill it

Night one, nobody else is aboard. That's the majority experience for months, so it's
built as a real screen, not an error: `01 — First aboard`, a halt guide that works with
no signal, the waiting room, a private note, and a QR/WhatsApp invite.

**The structural advantage:** your missing users are *physically present* — bored,
holding a phone, going to the same city. No other social app gets that.

**Distribution:** never launch to individuals. One Lucknow college, three WhatsApp groups,
same day. Time it to freshers' week or a semester-end travel weekend. Go quiet when the
app is empty; spend the one allowed notification on the second person joining.

**Scale without locking anyone out:** ship nationally, market to one corridor. An
off-route user sees an honest screen with a public threshold ("17 waiting, 40 turns it
on") — which doubles as demand data for where to expand. Expand on a hub: every next
corridor should end at Delhi so it reuses the same population.

---

## Tech

- **Frontend:** Expo / React Native (chosen for web background + fastest path to device)
- **Backend:** Supabase free tier — Postgres, auth, realtime, storage
- **Push:** Firebase Cloud Messaging (Supabase has none; FCM is free and unlimited)
- **Train data:** static timetable from data.gov.in, **bundled in the app**. No API, works
  offline. Live status is not free and not needed.
- **Package name:** `com.safar.app` (locked in — changing it breaks OAuth and Play identity)
- **Supabase Data API settings:** Data API ON, auto-expose new tables OFF, automatic RLS ON.
  Grants are therefore explicit — see schema section 14.

### Storage reality
25k accounts ≈ 12 MB. A busy night of 200 people talking ≈ 1.6 MB, deleted next day.
**Messages never accumulate.** Photos are the binding constraint — 1 GB free ≈ 25k users;
move to Cloudflare R2 (10 GB free) when that runs out.

---

## Design

- **Palette (winter blues):** Oxford `#02122F` ground · Storm `#23354D` · Steel `#495B7D`
  · Frost `#8BA3C5` · Moonlight `#F0ECDD`. Moonlight is the primary button colour.
  One exception: `#E4606F` for danger/report/emergency only — a safety control must not
  read as calm.
- **Display face:** **Jangkuy** by Azkia Fadhlan (@yukkazzu), Atas Creative Project.
  Free for personal and commercial use, attribution requested — credited in the footer.
  Caps-only and expanded, so it's set uppercase deliberately. Embedded as base64 in
  `index.html`; source files in `fonts/`.
- **UI face:** system grotesque. Jangkuy is for statements only — a person's name in
  wide caps would make the Onboard list unreadable.

---

## Files

```
safar/
  index.html          the prototype — 6 modes, self-contained, published as an artifact
  NOTES.md            this file
  app.json            Expo config — scheme safar://, package com.safar.app
  .env.example        copy to .env; Supabase URL and anon key
  app/                expo-router routes, one file per screen
    _layout.tsx       session bootstrap and the signed-in / signed-out gate
    index.tsx         sign in
    age.tsx           date of birth — UPDATEs profile_private
    onboard.tsx       stub; proves the session reaches the database
  lib/
    supabase.ts       client, session kept in the keystore
    auth.ts           Google sign-in through the system browser
    errors.ts         turns the database's exceptions into screens
    session.tsx       session context
    theme.ts          the palette
  backend/
    schema.sql        full Postgres schema, 17 sections, run top to bottom in Supabase
  fonts/
    JANGKUY-*.otf     display face (embedded in index.html; these are the source)
    JANGKUY-LICENSE.txt
```

The prototype's six modes: **Sign up · Night one · Someone joins · Off route · Busy train
· First run.** A notes panel beside the phone explains the reasoning for each screen.

---

## Next steps

Backend is finished and verified. Everything below is app work.

1. ~~Scaffold the Expo app~~ — done. SDK 57, `expo-router`, `com.safar.app`, scheme
   `safar://`. `npm run typecheck` is clean and `expo config` resolves.
2. ~~Add `safar://auth/callback` to Supabase → URL Configuration~~ — done. It belongs
   in **Redirect URLs**, not Site URL.
3. ~~Google Sign-In~~ — **done and verified on a device.** Two things were needed
   beyond the obvious: `flowType: 'pkce'` on the Supabase client (the default is
   implicit, which returns tokens in a URL fragment that never survives a deep
   link), and a real route at `app/auth/callback.tsx` — Android delivers the
   redirect to the app, so without that file expo-router shows "Unmatched Route".
   Sign-in worked without registering any SHA-1, so the Android OAuth client is
   still not set up; that bill comes due when sharing a build with other people.
4. ~~Age gate writes `dob`~~ — done in `app/age.tsx`, an UPDATE not an INSERT.
   The journey exception is caught in `lib/errors.ts`, which matches on the two
   messages from §17 and routes back to the age screen. **Match on message text is
   the weak point** — change the wording in schema.sql and the app stops routing.
   Worth an errcode if it ever moves.
5. ~~Add a journey properly~~ — **done.** `app/journey.tsx` picks off the bundled
   timetable, `app/onboard.tsx` is the real screen now: your journey, then
   `onboard_list()` for the people on it, with the first-aboard state when there
   are none. Still needs the rest of the corridor imported.
6. Chat + offline outbox (local write first, `client_id` for idempotent retry)
   ← **next, and the last big piece**
7. ~~Editable profile screen~~ — **done**, `app/profile.tsx`, both halves.
8. Privacy policy + Play Data Safety declaration
9. Import the corridor timetable into `data/services.ts` from data.gov.in.
10. Photo upload — needs Supabase Storage; the photo is Google's until then.

**Before production:** remove `http://localhost:8000/**` from Supabase's redirect
allowlist, and add the Google Play App Signing SHA-1 to the Android OAuth client.

---

## Known gaps

- ~~Only `dob` gets collected~~ — **closed.** `app/profile.tsx` fills in both halves:
  first name, bio and tags on one side of a divider, college, year, hometown,
  Instagram and phone on the other. Sign-up is still two taps; the profile is filled
  in afterwards, never during. Empty fields save as null, so `unlocked_profile()`
  returns nothing rather than blanks. The photo is still whatever Google gave us —
  changing it needs Supabase Storage.
- **`reports.chat_copy`** stores conversation snapshots permanently, outliving the expiry
  that governs everything else. Correct for a safety record; decide on redaction after
  review and state it in the privacy policy.
- **Google Sign-In needs three SHA-1 fingerprints eventually:** debug, EAS build, and
  **Google Play App Signing**. The third catches everyone — Play re-signs your app, so
  omitting it means sign-in works in testing and fails for every real user on launch day.
- Helpline numbers unverified (see Safety).
- Play Store: $25 one-time, and new personal accounts need a closed test with ~12 testers
  for ~14 days before production. Verify current rules.
