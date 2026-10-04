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

function findVoice(uri: string): SpeechSynthesisVoice | undefined {
  if (!uri) return undefined;
  try { return window.speechSynthesis.getVoices().find((v) => v.voiceURI === uri); } catch { return undefined; }
}

/**
 * Speaks English text with the learner's voice settings.
 * `factor` scales their chosen speed (e.g. 0.6 for "play slowly").
 */
export function speak(text: string, factor = 1, override?: Partial<VoicePrefs>): void {
  try {
    const p = { ...prefs, ...override };
    const u = new SpeechSynthesisUtterance(text);
    const v = findVoice(p.voice);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.rate = Math.min(2, Math.max(0.3, p.rate * factor));
    u.pitch = p.pitch;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // Speech not available in this browser.
  }
}

export function stopSpeaking(): void {
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
