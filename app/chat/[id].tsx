import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { loadMessages, subscribeToThread, type Message } from '../../lib/chat';
import { discard, enqueue, flush, onOutboxChange, type Outgoing } from '../../lib/outbox';
import { colour, space } from '../../lib/theme';

type Row =
  | { kind: 'sent'; message: Message }
  | { kind: 'pending'; message: Outgoing };

export default function Chat() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [queue, setQueue] = useState<Outgoing[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const list = useRef<FlatList<Row>>(null);

  const refresh = useCallback(async () => {
    const result = await loadMessages(id);
    if (result.ok) setMessages(result.messages);
    else setNote(result.error.message);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    refresh();
    flush(); // anything stranded from a previous session goes now

    const stop = subscribeToThread(id, (m) =>
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])),
    );
    return stop;
  }, [id, refresh]);

  useEffect(() => onOutboxChange((q) => setQueue(q.filter((m) => m.thread_id === id))), [id]);

  // A delivered message replaces its pending twin — matched on client_id, which
  // is why the phone generates it rather than the server.
  const rows = useMemo<Row[]>(() => {
    const delivered = new Set(messages.map((m) => m.client_id));
    return [
      ...messages.map((message) => ({ kind: 'sent' as const, message })),
      ...queue
        .filter((m) => !delivered.has(m.client_id))
        .map((message) => ({ kind: 'pending' as const, message })),
    ].sort((a, b) => a.message.created_at.localeCompare(b.message.created_at));
  }, [messages, queue]);

  async function send() {
    const body = draft.trim();
    if (!body || !me) return;
    setDraft('');
    await enqueue(id, me, body);
    requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.centre]}>
        <ActivityIndicator color={colour.frost} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.name}>{name ?? 'Chat'}</Text>
      </View>

      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.message.client_id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Say something. This disappears nine hours after the last message, so nobody
            has an inbox to keep up with.
          </Text>
        }
        renderItem={({ item }) => {
          const mine = item.kind === 'pending' || item.message.sender_id === me;
          const failed = item.kind === 'pending' ? item.message.failed : undefined;
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={mine ? styles.mineText : styles.theirsText}>{item.message.body}</Text>
              {item.kind === 'pending' ? (
                failed ? (
                  <Pressable onPress={() => discard(item.message.client_id)}>
                    <Text style={styles.failed}>{failed} Tap to remove.</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.pending}>Waiting for signal</Text>
                )
              ) : null}
            </View>
          );
        }}
      />

      {note ? <Text style={styles.note}>{note}</Text> : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={colour.steel}
          multiline
          maxLength={2000}
        />
        <Pressable style={styles.send} onPress={send} disabled={!draft.trim()}>
          <Text style={[styles.sendText, !draft.trim() && { opacity: 0.4 }]}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.oxford },
  centre: { justifyContent: 'center' },
  header: {
    paddingTop: space.xl * 1.6,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
  },
  back: { color: colour.steel, fontSize: 14 },
  name: { color: colour.moonlight, fontSize: 22, fontWeight: '700' },
  list: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
  empty: { color: colour.steel, fontSize: 14, lineHeight: 21, marginTop: space.lg },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: space.md, paddingVertical: 10 },
  mine: { alignSelf: 'flex-end', backgroundColor: colour.moonlight },
  theirs: { alignSelf: 'flex-start', backgroundColor: colour.storm },
  mineText: { color: colour.oxford, fontSize: 16, lineHeight: 22 },
  theirsText: { color: colour.moonlight, fontSize: 16, lineHeight: 22 },
  pending: { color: colour.steel, fontSize: 11, marginTop: 4 },
  failed: { color: colour.danger, fontSize: 11, marginTop: 4 },
  note: { color: colour.frost, textAlign: 'center', paddingBottom: space.sm },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: colour.storm,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colour.storm,
    color: colour.moonlight,
    borderRadius: 20,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 16,
  },
  send: { paddingHorizontal: space.md, paddingVertical: 12 },
  sendText: { color: colour.moonlight, fontSize: 16, fontWeight: '600' },
});
