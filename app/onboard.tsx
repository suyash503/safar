import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { readError } from '../lib/errors';
import { signOut } from '../lib/auth';
import { colour, space } from '../lib/theme';

/**
 * Placeholder for the real Onboard list. What it proves today is the one thing
 * worth proving first: that a signed-in session reaches the database, and that
 * the age gate's exception is caught and routed instead of crashing.
 *
 * Adding a journey properly — service picker, dates, the bundled timetable —
 * is the next piece of work; see NOTES.md → Next steps, item 5.
 */
export default function Onboard() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [danger, setDanger] = useState(false);

  async function tryAddJourney() {
    setNote(null);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    const { error } = await supabase.from('journeys').insert({
      user_id: user.user.id,
      mode: 'train',
      service_code: '12229', // Lucknow Mail, the reference service
      travel_date: new Date().toISOString().slice(0, 10),
      from_station: 'LKO',
      expires_at: new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString(),
    });

    const app = readError(error);
    if (!app) {
      setDanger(false);
      setNote('Journey added.');
      return;
    }
    if (app.route === 'age') {
      router.push('/age');
      return;
    }
    setDanger(app.route === 'blocked');
    setNote(app.message);
  }

  return (
    <View style={styles.screen}>
      <View>
        <Text style={styles.title}>Onboard</Text>
        <Text style={styles.body}>
          Nobody else has added this train yet. That is the normal first night — the
          screen for it is in the prototype and comes next.
        </Text>
      </View>

      <View style={{ gap: space.sm }}>
        {note ? (
          <Text style={[styles.note, danger && { color: colour.danger }]}>{note}</Text>
        ) : null}
        <Pressable style={styles.button} onPress={tryAddJourney}>
          <Text style={styles.buttonText}>Add the Lucknow Mail</Text>
        </Pressable>
        <Pressable style={styles.quiet} onPress={signOut}>
          <Text style={styles.quietText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colour.oxford,
    padding: space.lg,
    paddingTop: space.xl * 2,
    paddingBottom: space.xl,
    justifyContent: 'space-between',
  },
  title: { color: colour.moonlight, fontSize: 26, fontWeight: '700', marginBottom: space.md },
  body: { color: colour.frost, fontSize: 16, lineHeight: 24 },
  note: { color: colour.frost, textAlign: 'center' },
  button: {
    backgroundColor: colour.moonlight,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colour.oxford, fontSize: 16, fontWeight: '600' },
  quiet: { paddingVertical: 12, alignItems: 'center' },
  quietText: { color: colour.steel, fontSize: 14 },
});
