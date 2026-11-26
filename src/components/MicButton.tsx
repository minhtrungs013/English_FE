import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

/** The browser's speech recognition (Chrome, Edge, Safari); undefined where there is none (Firefox). */
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
const SpeechCtor = (): (new () => Recognition) | undefined => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
export const canDictate = () => typeof window !== 'undefined' && !!SpeechCtor();

const ERRORS: Record<string, string> = {
  'not-allowed': 'Allow the microphone for this site to speak your answer.',
  'service-not-allowed': 'Speech recognition isn’t allowed in this browser.',
  'no-speech': 'I didn’t hear anything — try again a bit closer to the microphone.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs an internet connection.'
};

/**
 * 🎤 Speak instead of typing: what you say (English) is written into the box after what's already there, as you speak.
 * Press again to stop. Hidden in browsers without speech recognition.
 */
export function MicButton({ value, onChange, disabled, onError, className = '' }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; onError?: (message: string) => void; className?: string;
}) {
  const [on, setOn] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => () => rec.current?.abort(), []);
  if (!canDictate()) return null;

  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    const Ctor = SpeechCtor()!;
    const r = new Ctor();
    r.lang = 'en-US'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    // What was typed before stays; the speech goes after it.
    const base = valueRef.current.trim();
    r.onresult = (e) => {
      let said = '';
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      said = said.trim();
      if (said) onChange((base ? base + ' ' : '') + said.charAt(0).toUpperCase() + said.slice(1));
    };
    r.onerror = (e) => { if (e.error !== 'aborted') onError?.(ERRORS[e.error] ?? 'Couldn’t hear you (' + e.error + ').'); };
    r.onend = () => { setOn(false); rec.current = null; };
    rec.current = r;
    try { r.start(); setOn(true); } catch { setOn(false); }
  };

  return (
    <button type="button" className={'iconbtn mic-btn' + (on ? ' on' : '') + (className ? ' ' + className : '')} onClick={toggle} disabled={disabled}
      aria-pressed={on} aria-label={on ? 'Stop listening' : 'Speak your answer'} title={on ? 'Listening… press to stop' : 'Speak your answer (English)'}>
      <Icon name={on ? 'stop' : 'mic'} size="sm" />
    </button>
  );
}
