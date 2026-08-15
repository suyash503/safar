import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SERVICES, stationName, type Service } from '../data/services';
import { addJourney, serviceDate } from '../lib/journey';
import { colour, space } from '../lib/theme';

/**
 * Add the train you are already on. Deliberately not a search box over every
 * train in India — the corridor is the product for now, and a short list you
 * can tap is faster than typing on a moving train.
 */
export default function AddJourney() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [danger, setDanger] = useState(false);

  async function add(service: Service) {
    setBusy(service.code);
    setNote(null);
    const travelDate = serviceDate(service);
    const result = await addJourney(service, travelDate);
    setBusy(null);

    if (result.ok) {
      router.replace('/onboard');
      return;
    }
    if (result.error.route === 'age') {
      // Come back here afterwards — the age screen is an interruption, not a
      // destination, and being dumped on Onboard means asking for the train twice.
      router.push({ pathname: '/age', params: { next: '/journey' } });
      return;
    }
    setDanger(result.error.route === 'blocked');
    setNote(result.error.message);
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Which train?</Text>
      <Text style={styles.body}>
        The one you are on right now. You can be seen only by people who added the same
        service on the same night.
      </Text>

      {SERVICES.map((s) => {
        const date = serviceDate(s);
        return (
          <Pressable
            key={s.code}
            style={[styles.card, busy === s.code && styles.cardBusy]}
            onPress={() => add(s)}
            disabled={busy !== null}
          >
            <View style={styles.cardTop}>
              <Text style={styles.code}>{s.code}</Text>
              <Text style={styles.name}>{s.name}</Text>
            </View>
            <Text style={styles.route}>
              {stationName(s.from)} {s.departs} → {stationName(s.to)} {s.arrives}
            </Text>
            {/* Shown because it is the thing most likely to be wrong, and a
                traveller can correct us instantly by reading it. */}
            <Text style={styles.date}>Departed {date}</Text>
          </Pressable>
        );
      })}

      {note ? <Text style={[styles.note, danger && { color: colour.danger }]}>{note}</Text> : null}

      <Text style={styles.small}>
        Only the Lucknow Mail is listed while the rest of the corridor timetable is
        imported.
      </Text>

      <Pressable style={styles.quiet} onPress={() => router.back()}>
        <Text style={styles.quietText}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: colour.oxford,
    padding: space.lg,
    paddingTop: space.xl * 2,
    gap: space.md,
  },
  title: { color: colour.moonlight, fontSize: 26, fontWeight: '700' },
  body: { color: colour.frost, fontSize: 16, lineHeight: 24, marginBottom: space.sm },
  card: {
    backgroundColor: colour.storm,
    borderRadius: 14,
    padding: space.md,
    gap: space.xs,
  },
  cardBusy: { opacity: 0.5 },
  cardTop: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  code: { color: colour.moonlight, fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  name: { color: colour.moonlight, fontSize: 16 },
  route: { color: colour.frost, fontSize: 14 },
  date: { color: colour.steel, fontSize: 13 },
  note: { color: colour.frost, textAlign: 'center' },
  small: { color: colour.steel, fontSize: 13, lineHeight: 19 },
  quiet: { paddingVertical: 12, alignItems: 'center' },
  quietText: { color: colour.steel, fontSize: 14 },
});
