import { useEffect, useState } from 'react';

export interface VoicePrefs {
  /** voiceURI of the chosen voice; '' = the browser's default English voice. */
  voice: string;
  rate: number;
  pitch: number;
}

let prefs: VoicePrefs = { voice: '', rate: 0.9, pitch: 1 };

/** Called by the app whenever the learner's voice settings change. */
export function setVoicePrefs(p: VoicePrefs): void { prefs = p; }

export function canSpeak(): boolean {
  try { return 'speechSynthesis' in window; } catch { return false; }
}

/**
 * The browser's voices. Chrome lists them a moment after the page loads (voiceschanged), so right after a reload the
 * list is empty — speaking then would use another voice for the first word.
 */
let voiceList: SpeechSynthesisVoice[] = [];
let waiting: (() => void)[] = [];
function refreshVoices() {
  try { voiceList = window.speechSynthesis.getVoices(); } catch { voiceList = []; }
  if (voiceList.length) { const w = waiting; waiting = []; w.forEach((f) => f()); }
}
if (canSpeak()) {
  refreshVoices();
  try { window.speechSynthesis.addEventListener('voiceschanged', refreshVoices); } catch { /* old browsers: the list is there already */ }
}

/** Runs fn once the voices are listed (right away when they are), or after 1 s at most. */
function whenVoices(fn: () => void): void {
  if (voiceList.length) { fn(); return; }
  let done = false;
  const go = () => { if (!done) { done = true; fn(); } };
  waiting.push(go);
  window.setTimeout(go, 1000);
}

function findVoice(uri: string): SpeechSynthesisVoice | undefined {
  return uri ? voiceList.find((v) => v.voiceURI === uri) : undefined;
}

/** The learner's voice, or else the browser's default English voice — named, so every word uses the same one. */
function voiceFor(uri: string): SpeechSynthesisVoice | undefined {
  return findVoice(uri)
    ?? voiceList.find((v) => v.default && /^en/i.test(v.lang))
    ?? voiceList.find((v) => /^en[-_]us/i.test(v.lang))
    ?? voiceList.find((v) => /^en/i.test(v.lang));
}

/** Bumped by every speak / stop, so a word waiting for the voice list isn't spoken after something newer. */
let turn = 0;

/**
 * Speaks English text with the learner's voice settings.
 * `factor` scales their chosen speed (e.g. 0.6 for "play slowly").
 */
export function speak(text: string, factor = 1, override?: Partial<VoicePrefs>): void {
  if (!canSpeak()) return;
  const mine = ++turn;
  // Stop what's playing now, even while waiting for the voices.
  try { window.speechSynthesis.cancel(); } catch { return; }
  whenVoices(() => {
    if (mine !== turn) return;
    try {
      const p = { ...prefs, ...override };
      const u = new SpeechSynthesisUtterance(text);
      const v = voiceFor(p.voice);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = Math.min(2, Math.max(0.3, p.rate * factor));
      u.pitch = p.pitch;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      // Speech not available in this browser.
    }
  });
}

export function stopSpeaking(): void {
  turn++;
  try { window.speechSynthesis.cancel(); } catch { /* not available */ }
}

/** English voices installed in this browser/OS. The list loads asynchronously in some browsers. */
export function useEnglishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!canSpeak()) return;
    const load = () => setVoices(
      window.speechSynthesis.getVoices()
        .filter((v) => v.lang.toLowerCase().startsWith('en'))
        .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
    );
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

/* ---------- dialogues: two voices, one line after another ---------- */

/** The learner's voice settings (rate and pitch are the base for dialogue voices). */
export function getVoicePrefs(): VoicePrefs { return prefs; }

const FEMALE = /female|woman|\b(zira|samantha|susan|hazel|karen|moira|tessa|fiona|victoria|allison|ava|serena|kate|catherine|jenny|aria|libby|sonia|emma|michelle|joanna|salli|kimberly|ivy|kendra|amy|natasha|clara|heera|linda|eva)\b|google us english/;
const MALE = /\bmale\b|\bman\b|\b(david|daniel|mark|george|james|alex|fred|ryan|guy|thomas|oliver|arthur|aaron|tom|rishi|christopher|eric|brian|matthew|joey|justin|liam|william|ravi|sean|richard)\b/;

/** 'female' / 'male' guessed from a voice's name ("Microsoft Zira", "Google UK English Male"), '' when it can't tell. */
export function voiceGender(v: SpeechSynthesisVoice): 'female' | 'male' | '' {
  const n = v.name.toLowerCase();
  // "female" contains "male", so it's checked first.
  if (/female/.test(n)) return 'female';
  if (MALE.test(n)) return 'male';
  if (FEMALE.test(n)) return 'female';
  return '';
}

export interface DialogueVoice { voice?: SpeechSynthesisVoice; pitch: number }

/**
 * A voice for each speaker: an English voice of the speaker's gender when one can be told from the names (the learner's
 * own voice first when it fits), never the same one twice when there's a choice. When both speakers end up with the same
 * voice (or there are no voices), their pitch differs instead.
 */
export function pickDialogueVoices(voices: SpeechSynthesisVoice[], genders: ('female' | 'male')[]): DialogueVoice[] {
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const mine = findVoice(prefs.voice);
  const lang = (mine?.lang ?? 'en-US').toLowerCase();
  // The learner's voice, then their accent, then US / UK English, then the rest.
  const rank = (v: SpeechSynthesisVoice) => (v === mine ? 0 : v.lang.toLowerCase() === lang ? 1 : /en[-_]us/i.test(v.lang) ? 2 : /en[-_]gb/i.test(v.lang) ? 3 : 4) + (v.localService ? 0 : 0.5);
  const sorted = [...en].sort((a, b) => rank(a) - rank(b));
  const picked: (SpeechSynthesisVoice | undefined)[] = [];
  genders.forEach((g, i) => {
    const taken = (v: SpeechSynthesisVoice) => picked.slice(0, i).includes(v);
    picked[i] = sorted.find((v) => voiceGender(v) === g && !taken(v))
      ?? sorted.find((v) => voiceGender(v) === '' && !taken(v))
      ?? sorted.find((v) => !taken(v))
      ?? sorted[0];
  });
  const same = picked.length === 2 && picked[0] === picked[1];
  const clamp = (p: number) => Math.min(2, Math.max(0, p));
  return genders.map((g, i) => {
    let pitch = prefs.pitch;
    if (same || !picked[i]) {
      // Same voice for both: the female (or first) speaker higher, the other lower.
      const high = genders[0] === genders[1] ? i === 0 : g === 'female';
      pitch = prefs.pitch * (high ? 1.15 : 0.85);
    }
    return { voice: picked[i], pitch: clamp(pitch) };
  });
}

/** Kept so the browser doesn't drop the utterance (and its onend) before it's spoken. */
let current: SpeechSynthesisUtterance | null = null;

/**
 * Speaks one line with the given voice; `factor` scales the learner's speed. onEnd runs when it ends, fails or is
 * cancelled (the caller tells those apart). Returns false when speech isn't available.
 */
export function speakLine(text: string, v: DialogueVoice, factor: number, onEnd: () => void): boolean {
  try {
    const u = new SpeechSynthesisUtterance(text);
    // No voice picked for the speaker (the list wasn't loaded yet): the learner's own, named, like every other line.
    const voice = v.voice ?? voiceFor(prefs.voice);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
    u.rate = Math.min(2, Math.max(0.3, prefs.rate * factor));
    u.pitch = v.pitch;
    turn++;
    const end = () => { if (current === u) current = null; onEnd(); };
    u.onend = end;
    u.onerror = end;
    window.speechSynthesis.cancel();
    current = u;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
