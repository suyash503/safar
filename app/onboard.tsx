import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { readError } from '../lib/errors';
import { signOut } from '../lib/auth';
import { startDm } from '../lib/chat';
import { flush } from '../lib/outbox';
import { stationName } from '../data/services';
import { colour, space } from '../lib/theme';

type Journey = { id: string; service_code: string; travel_date: string; from_station: string | null };
type Traveller = {
  id: string;
  first_name: string;
  photo_url: string | null;
  bio: string | null;
  tags: string[] | null;
  unlocked: boolean;
};

export default function Onboard() {
  const router = useRouter();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [people, setPeople] = useState<Traveller[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  /**
   * start_dm() is where the rules live: you must share the journey, neither of
   * you may have blocked the other, and a new account gets three conversations
   * per journey. Tapping the same person twice returns the same thread.
   */
  async function talkTo(person: Traveller) {
    if (!journey) return;
    setOpening(person.id);
    setNote(null);
    const result = await startDm(person.id, journey.service_code, journey.travel_date);
    setOpening(null);
    if (!result.ok) {
      setNote(result.error.message);
      return;
    }
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: result.threadId,
        name: person.first_name,
        // thread_members only returns your own row since the recursion fix, so
        // the chat cannot look up who it is talking to — it is told.
        other: person.id,
        service: journey.service_code,
        date: journey.travel_date,
      },
    });
  }

  const load = useCallback(async () => {
    setNote(null);
    // Coming back into signal is the moment to drain anything written in a tunnel.
    flush();
    const { data: me } = await supabase.auth.getUser();
    if (!me.user) return;

    const { data: rows, error } = await supabase
      .from('journeys')
      .select('id, service_code, travel_date, from_station')
      .eq('user_id', me.user.id)
      .gt('expires_at', new Date().toISOString())
      .order('travel_date', { ascending: false })
      .limit(1);

    if (error) {
      setNote(readError(error)?.message ?? null);
      setLoading(false);
      return;
    }

    const current = rows?.[0] ?? null;
    setJourney(current);

    if (current) {
      // The one query the app actually runs. Public fields only — no coach, no
      // seat, no destination. Those exist but no policy exposes them.
      const { data: list, error: listError } = await supabase.rpc('onboard_list', {
        p_service: current.service_code,
        p_date: current.travel_date,
      });
      if (listError) setNote(readError(listError)?.message ?? null);
      setPeople((list as Traveller[]) ?? []);
    } else {
      setPeople([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={[styles.screen, styles.centre]}>
        <ActivityIndicator color={colour.frost} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colour.frost} />}
    >
      {!journey ? (
        <View style={styles.block}>
          <Text style={styles.title}>Not on a train</Text>
          <Text style={styles.body}>
            Add the one you are on and you will see the others who did the same.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.block}>
            <Text style={styles.service}>{journey.service_code}</Text>
            <Text style={styles.body}>
              {journey.from_station ? stationName(journey.from_station) + ' · ' : ''}
              {journey.travel_date}
            </Text>
          </View>

          {people.length === 0 ? (
            // Night one is the majority experience for months. It is a real
            // screen, not an error — see NOTES.md, cold start.
            <View style={styles.block}>
              <Text style={styles.title}>First aboard</Text>
              <Text style={styles.body}>
                Nobody else has added this train yet. You will be told once — and only
                once — when somebody does.
              </Text>
            </View>
          ) : (
            people.map((p) => (
              <Pressable
                key={p.id}
                style={styles.card}
                onPress={() => talkTo(p)}
                disabled={opening === p.id}
              >
                {p.photo_url ? (
                  <Image source={{ uri: p.photo_url }} style={styles.photo} />
                ) : (
                  <View style={[styles.photo, styles.photoBlank]} />
                )}
                <View style={styles.cardText}>
                  <Text style={styles.name}>{p.first_name}</Text>
                  {p.bio ? <Text style={styles.bio}>{p.bio}</Text> : null}
                  {p.tags?.length ? <Text style={styles.tags}>{p.tags.join(' · ')}</Text> : null}
                </View>
                {opening === p.id ? <ActivityIndicator color={colour.frost} /> : null}
              </Pressable>
            ))
          )}
        </>
      )}

      {note ? <Text style={styles.note}>{note}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={() => router.push('/journey')}>
          <Text style={styles.buttonText}>
            {journey ? 'Add another train' : 'Add the train you are on'}
          </Text>
        </Pressable>
        <Pressable style={styles.quiet} onPress={() => router.push('/profile')}>
          <Text style={styles.quietText}>Your profile</Text>
        </Pressable>
        <Pressable style={styles.quiet} onPress={signOut}>
          <Text style={styles.quietText}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: colour.oxford,
    padding: space.lg,
    paddingTop: space.xl * 2,
    paddingBottom: space.xl,
    gap: space.md,
  },
  centre: { justifyContent: 'center' },
  block: { gap: space.sm },
  title: { color: colour.moonlight, fontSize: 26, fontWeight: '700' },
  service: { color: colour.moonlight, fontSize: 32, fontWeight: '700', letterSpacing: 2 },
  body: { color: colour.frost, fontSize: 16, lineHeight: 24 },
  card: {
    backgroundColor: colour.storm,
    borderRadius: 14,
    padding: space.md,
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
  },
  photo: { width: 52, height: 52, borderRadius: 26, backgroundColor: colour.steel },
  photoBlank: { opacity: 0.4 },
  cardText: { flex: 1, gap: 2 },
  name: { color: colour.moonlight, fontSize: 17, fontWeight: '600' },
  bio: { color: colour.frost, fontSize: 14, lineHeight: 20 },
  tags: { color: colour.steel, fontSize: 13 },
  note: { color: colour.frost, textAlign: 'center' },
  actions: { marginTop: 'auto', gap: space.xs },
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
