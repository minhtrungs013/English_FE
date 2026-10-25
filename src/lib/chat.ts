import { API_BASE, ApiError, getToken, type Quota } from './api';
import type { FamilyMember, Level } from './data';

/** A word card from the server: the data and the status (in my words / in the library / new) are real, not the bot's words. */
export interface ChatCard {
  word: string; ipa: string; pos: string; meaning: string; vi: string; ex: string; level: Level | ''; family: FamilyMember[];
  /** Missing on cards saved in the chat history before they were sent. */
  syn?: string[]; ant?: string[]; topic?: string;
  status: 'mine' | 'library' | 'new';
  /** My word's id ("mine") or the library word's id ("library"). */
  id?: string;
  /** New words: 'ai' (shared to the library when added) or 'online' (free dictionaries: only saved). */
  source?: 'ai' | 'online';
  /** The meaning this question is about, when the card's Vietnamese doesn't have it. */
  sense?: string;
}

/** True when a Vietnamese field ("nền tảng, sân ga") already has this meaning (the server's rule). */
export function hasMeaning(vi: string, sense: string): boolean {
  const s = sense.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
  const parts = vi.toLowerCase().normalize('NFC').split(/[,;/]/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return !!s && parts.some((p) => p === s || p.includes(s) || s.includes(p));
}
export interface ChatLesson { id: string; name: string; vi: string }

export interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  cards?: ChatCard[];
  /** Words the bot looked up but found nothing for. */
  missing?: string[];
  lessons?: ChatLesson[];
  error?: string;
}

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'word'; card: ChatCard }
  | { type: 'notfound'; word: string }
  | { type: 'grammar'; lesson: ChatLesson }
  | { type: 'done'; quota: Quota }
  | { type: 'error'; message: string };

export interface ChatStatus extends Quota { fake: boolean }

export async function chatStatus(): Promise<ChatStatus> {
  const res = await fetch(API_BASE + '/chat', { headers: { Authorization: 'Bearer ' + (getToken() ?? '') } });
  if (!res.ok) throw new ApiError('Request failed (' + res.status + ')', res.status);
  return (await res.json()) as ChatStatus;
}

/**
 * Sends the conversation (the last 10 turns) and calls `onEvent` for each streamed event.
 * Limit and validation errors come back as an ApiError before anything streams.
 */
export async function chatAsk(history: ChatMsg[], onEvent: (e: ChatEvent) => void, signal: AbortSignal): Promise<void> {
  const messages = history.filter((m) => m.text.trim() && !m.error).slice(-10).map((m) => ({ role: m.role, content: m.text.slice(0, 3000) }));
  let res: Response;
  try {
    res = await fetch(API_BASE + '/chat', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (getToken() ?? '') },
      body: JSON.stringify({ messages })
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ApiError('Không kết nối được máy chủ. Bạn thử lại sau nhé.', 0);
  }
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const m = json?.message;
    throw new ApiError((Array.isArray(m) ? m.join(' ') : m) || 'Request failed (' + res.status + ')', res.status);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const p of parts) {
      const line = p.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try { onEvent(JSON.parse(line.slice(5).trim()) as ChatEvent); } catch { /* ignore a malformed event */ }
    }
  }
}

/** Adds one streamed event to the bot's message being written. */
export function applyEvent(m: ChatMsg, e: ChatEvent): ChatMsg {
  switch (e.type) {
    case 'text': return { ...m, text: m.text + e.text };
    case 'word': return { ...m, cards: [...(m.cards ?? []), e.card] };
    case 'notfound': return { ...m, missing: [...(m.missing ?? []), e.word] };
    case 'grammar': return (m.lessons ?? []).some((l) => l.id === e.lesson.id) ? m : { ...m, lessons: [...(m.lessons ?? []), e.lesson] };
    case 'error': return { ...m, error: e.message };
    default: return m;
  }
}

/* ---------- history on this device (per user) ---------- */
const KEY = (user: string) => 'wordbook:chat:' + user;
/** Kept on this device only; the last 60 messages. */
export function loadChat(user: string): ChatMsg[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(user)) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as ChatMsg[]).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string') : [];
  } catch {
    return [];
  }
}
export function saveChat(user: string, msgs: ChatMsg[]): void {
  try {
    if (msgs.length) localStorage.setItem(KEY(user), JSON.stringify(msgs.slice(-60)));
    else localStorage.removeItem(KEY(user));
  } catch { /* storage full or blocked: keep it in memory only */ }
}
