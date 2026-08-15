import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
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
  attempts?: number;
  failed?: string; // set when it will never send; kept so the UI can say so
};

/**
 * How many unexplained failures before we stop trying. Coming out of a tunnel is
 * exactly when odd, temporary errors happen — a stale token, a half-open socket —
 * so an error we do not recognise is worth retrying rather than treating as fatal.
 */
const MAX_ATTEMPTS = 5;

const KEY = 'safar.outbox.v1';

type Listener = (queue: Outgoing[]) => void;
const listeners = new Set<Listener>();

/**
 * Fired when messages actually land. The chat screen needs this: a delivered
 * message leaves the outbox, so its pending bubble vanishes, and without a
 * refetch the message disappears from view entirely — sitting safely in the
 * database while the sender watches it evaporate.
 */
type DeliveredListener = (threadIds: string[]) => void;
const deliveredListeners = new Set<DeliveredListener>();

export function onDelivered(listener: DeliveredListener) {
  deliveredListeners.add(listener);
  return () => {
    deliveredListeners.delete(listener);
  };
}

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

    // Ask the OS rather than inferring it from an error string. Whatever a failed
    // fetch looks like on a given device, a message must never burn an attempt
    // for the offence of being written in a tunnel.
    if ((await NetInfo.fetch()).isConnected === false) return;

    const survivors: Outgoing[] = [];
    const delivered: string[] = [];
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

      if (!error) {
        delivered.push(message.thread_id);
        continue;
      }

      // A duplicate means an earlier attempt actually landed — this is the
      // tunnel case the client_id exists for.
      if (error.code === '23505') {
        delivered.push(message.thread_id);
        continue;
      }

      const app = readError(error);
      const offline = app?.message.startsWith('No signal');

      if (offline) {
        // Keep it, and stop — no point hammering the rest with no network.
        survivors.push(message, ...queue.slice(queue.indexOf(message) + 1));
        break;
      }

      // Things the database will refuse identically forever. Retrying these is a
      // queue that never drains, so they stop here and the UI explains.
      const permanent =
        error.code === '42501' || // not allowed to post here at all
        app?.message.startsWith('Links are off') ||
        app?.message.startsWith('New accounts can start') ||
        app?.message.startsWith('That person is no longer');

      const attempts = (message.attempts ?? 0) + 1;
      survivors.push(
        permanent || attempts >= MAX_ATTEMPTS
          ? { ...message, attempts, failed: app?.message ?? 'Not sent.' }
          : { ...message, attempts },
      );
    }
    await write(survivors);
    if (delivered.length > 0) deliveredListeners.forEach((l) => l([...new Set(delivered)]));
  } finally {
    flushing = false;
  }
}

/**
 * Nothing used to notice when signal came back. If you sat on the chat screen
 * through a tunnel, the queue waited until you happened to navigate somewhere —
 * which on this route could be the whole journey. Three things wake it now:
 * regaining a connection, returning to the app, and a slow tick as a backstop
 * for the times the OS lies about connectivity.
 */
export function startOutboxPump() {
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    if (state.isConnected) flush();
  });

  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') flush();
  });

  const tick = setInterval(async () => {
    if ((await read()).some((m) => !m.failed)) flush();
  }, 20_000);

  return () => {
    unsubscribeNet();
    appState.remove();
    clearInterval(tick);
  };
}

/** Drop a message that will never send, after the user has seen why. */
export async function discard(clientId: string) {
  await write((await read()).filter((m) => m.client_id !== clientId));
}

/** Give up on giving up: clear the failure and try again from scratch. */
export async function retry(clientId: string) {
  const queue = await read();
  await write(
    queue.map((m) =>
      m.client_id === clientId ? { ...m, attempts: 0, failed: undefined } : m,
    ),
  );
  flush();
}
