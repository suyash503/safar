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
| Database schema | **Done** — all 15 sections applied to Supabase and verified |
| `pg_cron` sweep | **Done** — `safar-sweep`, hourly |
| Google OAuth — web client | **Done** in Google Console + Supabase |
| Google OAuth — Android client | **Deferred** (needs a build for the SHA-1) |
| Expo app | **Not started** ← next |
| Privacy policy / Play Data Safety | Not started |

**Verified state of the database** (re-run any time to confirm nothing drifted):

```
tables 11 · rls enabled 11 · policies 15 · triggers 4 · auth hook 1
ANON GRANTS 0 · authenticated tables 11 · cron job safar-sweep active
```

`ANON GRANTS 0` is the important one — an unauthenticated client can reach nothing.

---

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
  HANDOFF.md          this file
  backend/
    schema.sql        full Postgres schema, 14 sections, run top to bottom in Supabase
  fonts/
    JANGKUY-*.otf     display face (embedded in index.html; these are the source)
    JANGKUY-LICENSE.txt
```

The prototype's six modes: **Sign up · Night one · Someone joins · Off route · Busy train
· First run.** A notes panel beside the phone explains the reasoning for each screen.

---

## Next steps

1. **Scaffold the Expo app** — package `com.safar.app`, deep link scheme `safar://`
2. Add `safar://auth/callback` to Supabase → Authentication → URL Configuration
3. Google Sign-In end to end → profile row created by the `handle_new_user` trigger
4. **First real RLS test:** signed in from the client, `select count(*) from profile_private`
   must return exactly 1. This cannot be tested from the SQL editor — that runs as a
   superuser and bypasses RLS entirely.
5. Add a journey → `onboard_list()` returning real rows
6. Chat + offline outbox (local write first, `client_id` for idempotent retry)
7. Editable profile screen to populate `profile_private` (see Known gaps)
8. Privacy policy + Play Data Safety declaration

---

## Known gaps

- **`profile_private` is never populated.** Unlock reveals college/year/hometown/Instagram,
  but sign-up asks for none of them. Needs an editable profile screen — keep sign-up at
  two taps.
- **`reports.chat_copy`** stores conversation snapshots permanently, outliving the expiry
  that governs everything else. Correct for a safety record; decide on redaction after
  review and state it in the privacy policy.
- **Google Sign-In needs three SHA-1 fingerprints eventually:** debug, EAS build, and
  **Google Play App Signing**. The third catches everyone — Play re-signs your app, so
  omitting it means sign-in works in testing and fails for every real user on launch day.
- Helpline numbers unverified (see Safety).
- Play Store: $25 one-time, and new personal accounts need a closed test with ~12 testers
  for ~14 days before production. Verify current rules.
