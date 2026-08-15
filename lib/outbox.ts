import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { readError } from './errors';

/**
 * Trains lose signal for about forty minutes past Etawah. An app that waits on a
 * server there looks broken, so a message is written locally first and sent
 * whenever the network comes back.
 *
 * Every message carries a client_id generated on the phone. messages is unique
 * on (thread_id, client_id), so a retry after a tunnel can never double-post —
 * the database throws away the duplicate rather than trusting us to be careful.
 */
export type Outgoing = {
  client_id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string; // for ordering next to delivered messages
  failed?: string; // set when it will never send; kept so the UI can say so
};

const KEY = 'safar.outbox.v1';

type Listener = (queue: Outgoing[]) => void;
const listeners = new Set<Listener>();

async function read(): Promise<Outgoing[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Outgoing[];
  } catch {
    // A corrupt outbox must not brick the chat screen.
    await AsyncStorage.removeItem(KEY);
    return [];
  }
}

async function write(queue: Outgoing[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(queue));
  listeners.forEach((l) => l(queue));
}

export function onOutboxChange(listener: Listener) {
  listeners.add(listener);
  read().then(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function pendingFor(threadId: string) {
  return (await read()).filter((m) => m.thread_id === threadId);
}

/** Write locally, then try. The caller does not wait on the network. */
export async function enqueue(threadId: string, senderId: string, body: string) {
  const message: Outgoing = {
    client_id: Crypto.randomUUID(),
    thread_id: threadId,
    sender_id: senderId,
    body,
    created_at: new Date().toISOString(),
  };
  await write([...(await read()), message]);
  flush();
  return message;
}

let flushing = false;

/**
 * Try to send everything queued. Safe to call often — it is a no-op while
 * already running, and the database deduplicates anything sent twice.
 */
export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const queue = await read();
    if (queue.length === 0) return;

    const survivors: Outgoing[] = [];
    for (const message of queue) {
      if (message.failed) {
        survivors.push(message);
        continue;
      }

      const { error } = await supabase.from('messages').insert({
        thread_id: message.thread_id,
        sender_id: message.sender_id,
        body: message.body,
        client_id: message.client_id,
      });

      if (!error) continue; // delivered, drop it

      // A duplicate means an earlier attempt actually landed — this is the
      // tunnel case the client_id exists for.
      if (error.code === '23505') continue;

      const app = readError(error);
      const offline = app?.message.startsWith('No signal');
      // Offline: keep it and try again later. Anything else — a link from a new
      // account, an expired thread — will fail identically forever, so stop
      // retrying and let the UI explain instead of silently swallowing it.
      survivors.push(offline ? message : { ...message, failed: app?.message ?? 'Not sent.' });
      if (offline) {
        // No point hammering the rest while there is no network.
        survivors.push(...queue.slice(queue.indexOf(message) + 1));
        break;
      }
    }
    await write(survivors);
  } finally {
    flushing = false;
  }
}

/** Drop a message that will never send, after the user has seen why. */
export async function discard(clientId: string) {
  await write((await read()).filter((m) => m.client_id !== clientId));
}
