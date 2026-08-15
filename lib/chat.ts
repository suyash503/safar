import { supabase } from './supabase';
import { readError, type AppError } from './errors';

export type Message = {
  id: string;
  sender_id: string;
  body: string;
  client_id: string;
  created_at: string;
};

/**
 * start_dm() decides whether this conversation may exist at all: you must share
 * the journey, neither of you may have blocked the other, and a new account gets
 * three conversations per journey. It hands back the existing thread if you are
 * already talking, so tapping someone twice is harmless.
 */
export async function startDm(other: string, service: string, date: string) {
  const { data, error } = await supabase.rpc('start_dm', {
    other,
    p_service: service,
    p_date: date,
  });
  if (error) return { ok: false as const, error: readError(error)! };
  return { ok: true as const, threadId: data as string };
}

export async function loadMessages(threadId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, body, client_id, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) return { ok: false as const, error: readError(error) as AppError };
  return { ok: true as const, messages: (data ?? []) as Message[] };
}

/**
 * Live updates for one thread. Needs the table added to the realtime publication:
 *   alter publication supabase_realtime add table public.messages;
 * Without that this simply never fires, which is why the screen also refetches
 * when it regains focus rather than trusting the socket alone.
 */
export function subscribeToThread(threadId: string, onInsert: (m: Message) => void) {
  const channel = supabase
    .channel(`thread:${threadId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
      (payload) => onInsert(payload.new as Message),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
