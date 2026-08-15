import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { askUnlock, loadUnlocked, unlockState, type Unlocked } from '../lib/unlock';
import { colour, space } from '../lib/theme';

/**
 * Sits above a conversation. Three states, and the wording matters more than the
 * code: asking must never read as a request the other person will receive, because
 * they will not receive it. Nothing here can reveal whether they have asked — only
 * that it has become mutual, which both sides learn at the same moment.
 */
export function UnlockPanel({
  other,
  name,
  service,
  date,
}: {
  other: string;
  name: string;
  service: string;
  date: string;
}) {
  const [state, setState] = useState<{ iAsked: boolean; mutual: boolean } | null>(null);
  const [profile, setProfile] = useState<Unlocked | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const s = await unlockState(other, service, date);
    setState(s);
    if (s.mutual) {
      const result = await loadUnlocked(other);
      if (result.ok) setProfile(result.profile);
    }
  }, [other, service, date]);

  useEffect(() => {
    load();
  }, [load]);

  async function ask() {
    setBusy(true);
    setNote(null);
    const result = await askUnlock(other, service, date);
    setBusy(false);
    if (!result.ok) {
      setNote(result.error.message);
      return;
    }
    await load();
    if (!result.mutual) setState({ iAsked: true, mutual: false });
  }

  if (!state) return null;

  if (state.mutual && profile) {
    const lines: [string, string | null][] = [
      ['Coach', profile.coach],
      ['Seat', profile.seat],
      ['Getting off at', profile.to_station],
      ['College', profile.college],
      ['Year', profile.study_year],
      ['Hometown', profile.hometown],
      ['Instagram', profile.instagram ? '@' + profile.instagram : null],
      ['Phone', profile.phone],
    ];
    const filled = lines.filter(([, v]) => v);

    return (
      <View style={styles.panel}>
        <Pressable onPress={() => setOpen((o) => !o)}>
          <Text style={styles.unlocked}>Unlocked · you both asked {open ? '▾' : '▸'}</Text>
        </Pressable>
        {open ? (
          filled.length ? (
            <View style={styles.details}>
              {filled.map(([label, value]) => (
                <View key={label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailValue}>{value}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.hint}>{name} has not filled any of it in yet.</Text>
          )
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      {state.iAsked ? (
        <Text style={styles.hint}>
          You asked to unlock. It opens only if {name} asks too — and they are not told
          you asked.
        </Text>
      ) : (
        <>
          <Pressable style={styles.ask} onPress={ask} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colour.moonlight} />
            ) : (
              <Text style={styles.askText}>Ask to unlock</Text>
            )}
          </Pressable>
          <Text style={styles.hint}>
            Coach, seat, where they are getting off, college, Instagram. Silent — {name}{' '}
            is never told you asked, and it opens only if they ask too.
          </Text>
        </>
      )}
      {note ? <Text style={styles.error}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    padding: space.md,
    backgroundColor: colour.storm,
    borderRadius: 14,
    gap: space.sm,
  },
  unlocked: { color: colour.moonlight, fontSize: 14, fontWeight: '600' },
  details: { gap: space.xs },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  detailLabel: { color: colour.steel, fontSize: 14 },
  detailValue: { color: colour.moonlight, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  ask: {
    borderWidth: 1,
    borderColor: colour.frost,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  askText: { color: colour.moonlight, fontSize: 15, fontWeight: '600' },
  hint: { color: colour.steel, fontSize: 12, lineHeight: 18 },
  error: { color: colour.danger, fontSize: 12 },
});
