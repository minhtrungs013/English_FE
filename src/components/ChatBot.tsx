import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ASK_AI_EVENT } from '../lib/askAi';
import { api, ApiError } from '../lib/api';
import { applyEvent, chatAsk, chatStatus, hasMeaning, loadChat, saveChat, type ChatCard, type ChatMsg, type ChatStatus } from '../lib/chat';
import { speak } from '../lib/speech';
import { useWB } from '../state/WordbookContext';
import { Icon } from './ui';

const SUGGESTIONS = ['Giải thích từ “device”', 'So sánh present perfect và past simple', 'Đặt câu với “follow up”'];
/** Lessons without drills (nothing to practise). */
const NO_PRACTICE = new Set(['aux-cheatsheet']);

/** **bold** inside a line. */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}
/** Just enough markdown for the bot: paragraphs, "- " lists and bold. */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{para.flatMap((l, i) => (i ? [<br key={'b' + i} />, ...inline(l)] : inline(l)))}</p>);
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const item = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (item) { flushPara(); list.push(item[1]); }
    else if (!line.trim()) { flushPara(); flushList(); }
    else { flushList(); para.push(line); }
  }
  flushPara();
  flushList();
  return <>{blocks}</>;
}

function WordCard({ card, onLeave }: { card: ChatCard; onLeave: () => void }) {
  const { s, a } = useWB();
  const [busy, setBusy] = useState(false);
  // The live state wins: a word saved after the answer came shows as saved.
  const mine = s.words.find((w) => w.word.toLowerCase() === card.word.toLowerCase());
  const status = mine ? 'mine' : card.status;
  const inLibrary = s.shared.includes(card.word.toLowerCase());
  /** The meaning this question is about, while the word (mine or the library's) doesn't have it yet. */
  const sense = card.sense && !hasMeaning(mine ? mine.vi : card.vi, card.sense) ? card.sense : '';
  const [suggested, setSuggested] = useState(false);
  const suggest = async () => {
    if (!card.id || !sense) return;
    setBusy(true);
    try {
      const r = await api.suggestMeaning(card.id, sense);
      setSuggested(true);
      a.showToast(r.status === 'exists' ? 'Thư viện đã có nghĩa này.' : 'Đã gửi đề xuất — admin sẽ duyệt nghĩa “' + sense + '”.');
    } catch (e) {
      a.showToast(e instanceof Error ? e.message : 'Không gửi được đề xuất.', 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cb-card">
      <div className="cb-cardhead">
        <div className="cb-cardword">
          <strong>{card.word}</strong>
          {card.ipa ? <span className="cb-ipa">{card.ipa}</span> : null}
        </div>
        <button className="iconbtn sm" onClick={() => speak(card.word)} aria-label={'Nghe phát âm ' + card.word}><Icon name="volume" /></button>
      </div>
      <div className="badges">
        {card.pos ? <span className="badge" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>{card.pos}</span> : null}
        {card.level ? <span className={'badge lv-' + card.level}>{card.level}</span> : null}
      </div>
      {(mine?.vi || card.vi) ? <div className="cb-vi">{mine?.vi || card.vi}</div> : null}
      {sense ? (
        <div className="cb-sense">
          <span>Trong câu này: <b>{sense}</b></span>
          {status === 'mine' && mine ? (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={async () => { setBusy(true); await a.addWordMeaning(mine.id, sense); setBusy(false); }}>
              <Icon name="plus" size="sm" />Thêm nghĩa này vào từ của tôi
            </button>
          ) : status === 'library' && card.id ? (
            suggested ? <span className="cb-note"><Icon name="checkc" size="sm" />Đã gửi đề xuất</span> : (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={suggest}><Icon name="plus" size="sm" />Đề xuất thêm nghĩa này cho thư viện</button>
            )
          ) : status === 'new' ? <span className="muted xs">Nghĩa này sẽ được lưu đầu tiên.</span> : null}
        </div>
      ) : null}
      {card.meaning ? <div className="cb-mean">{card.meaning}</div> : null}
      {card.ex ? (
        <div className="cb-ex">
          <span>“{card.ex}”</span>
          <button className="iconbtn sm" onClick={() => speak(card.ex)} aria-label="Nghe câu ví dụ"><Icon name="volume" /></button>
        </div>
      ) : null}
      <div className="cb-cardfoot">
        {status === 'mine' ? (
          <>
            <span className="cb-note"><Icon name="checkc" size="sm" />{card.status === 'new' && inLibrary ? 'Đã lưu và chia sẻ lên thư viện' : card.status === 'new' ? 'Đã lưu vào sổ của bạn' : 'Đã có trong sổ của bạn'}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { a.go('detail', { sel: mine?.id ?? card.id ?? null }); onLeave(); }}>Xem từ</button>
          </>
        ) : status === 'library' && card.id ? (
          <>
            <span className="cb-note">Từ này có trong thư viện</span>
            <button className="btn btn-primary btn-sm" disabled={busy}
              onClick={async () => { setBusy(true); await a.saveFromLibrary({ id: card.id!, word: card.word }); setBusy(false); }}>
              <Icon name="plus" size="sm" />Lưu vào My Vocabulary
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => { setBusy(true); await a.addChatWord(card); setBusy(false); }}>
            <Icon name="plus" size="sm" />{busy ? 'Đang thêm…' : 'Thêm vào My Vocabulary'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The study assistant: a round button in the bottom-right corner and a chat panel (full screen on phones).
 * Not shown in full-screen sessions (review, practice, course study, grammar practice, dictation): App leaves it out there.
 * History stays on this device (localStorage, per user).
 */
export function ChatBot() {
  const { s, a } = useWB();
  const user = s.userId;
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => loadChat(user));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const abort = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Another account on this device has its own history.
  useEffect(() => { setMsgs(loadChat(user)); }, [user]);
  useEffect(() => { if (!busy) saveChat(user, msgs); }, [user, msgs, busy]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    chatStatus().then(setStatus).catch(() => { /* the count is optional */ });
  }, [open]);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, open]);
  useEffect(() => () => abort.current?.abort(), []);

  // "Ask AI" from a search: open the panel and send the question once it's open.
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => { setPending((e as CustomEvent<string>).detail); setOpen(true); };
    window.addEventListener(ASK_AI_EVENT, on);
    return () => window.removeEventListener(ASK_AI_EVENT, on);
  }, []);
  useEffect(() => {
    if (!open || !pending || busy) return;
    const q = pending;
    setPending(null);
    void send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pending, busy]);

  const close = () => setOpen(false);
  /** Leaving for another page: close the panel on phones (it covers the screen), keep it on wide screens. */
  const leave = () => { if (window.matchMedia('(max-width: 760px)').matches) setOpen(false); };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    if (q.length > 500) { a.showToast('Câu hỏi tối đa 500 ký tự.'); return; }
    const history: ChatMsg[] = [...msgs, { role: 'user', text: q }];
    setMsgs([...history, { role: 'assistant', text: '' }]);
    setInput('');
    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    // After "new conversation" the list is empty: late events have nowhere to go.
    const update = (fn: (m: ChatMsg) => ChatMsg) => setMsgs((prev) => (prev.length && prev[prev.length - 1].role === 'assistant' ? [...prev.slice(0, -1), fn(prev[prev.length - 1])] : prev));
    try {
      await chatAsk(history, (e) => {
        if (e.type === 'done') setStatus((st) => ({ fake: st?.fake ?? false, ...e.quota }));
        else update((m) => applyEvent(m, e));
      }, ctl.signal);
    } catch (e) {
      if (!ctl.signal.aborted) update((m) => ({ ...m, error: e instanceof ApiError ? e.message : 'Đã có lỗi. Bạn thử lại sau nhé.' }));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const reset = () => {
    abort.current?.abort();
    setMsgs([]);
    setBusy(false);
    inputRef.current?.focus();
  };

  const left = status ? Math.max(0, status.limit - status.used) : null;

  if (!open) {
    return (
      <button className="cb-bubble" onClick={() => setOpen(true)} aria-label="Mở trợ lý học tiếng Anh" title="Trợ lý học tiếng Anh">
        <Icon name="chat" />
      </button>
    );
  }
  return (
    <section className="cb-panel" role="dialog" aria-label="Trợ lý học tiếng Anh" onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
      <header className="cb-head">
        <div className="cb-title">
          <span className="cb-avatar"><Icon name="sparkle" size="sm" /></span>
          <div>
            <strong>Trợ lý tiếng Anh</strong>
            <div className="cb-sub">
              {status?.fake ? <span className="cb-fake">Chế độ thử</span> : null}
              {left !== null ? 'Còn ' + left + '/' + status!.limit + ' tin hôm nay' : 'Hỏi về từ vựng và ngữ pháp'}
            </div>
          </div>
        </div>
        <div className="cb-headbtns">
          {msgs.length ? <button className="btn btn-ghost btn-sm cb-new" onClick={reset} aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới"><Icon name="plus" size="sm" /><span>Cuộc trò chuyện mới</span></button> : null}
          <button className="iconbtn" onClick={close} aria-label="Đóng trợ lý"><Icon name="x" /></button>
        </div>
      </header>

      <div className="cb-log" ref={logRef} aria-live="polite" aria-busy={busy}>
        {!msgs.length ? (
          <div className="cb-hello">
            <p>Xin chào{s.settings.name ? ' ' + s.settings.name : ''}! Mình giúp bạn giải thích từ, đặt câu và ôn ngữ pháp. Câu trả lời bằng tiếng Việt, ví dụ bằng tiếng Anh.</p>
            <div className="cb-suggest">
              {SUGGESTIONS.map((x) => <button key={x} className="chip" onClick={() => void send(x)}>{x}</button>)}
            </div>
          </div>
        ) : msgs.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} className="cb-msg cb-me">{m.text}</div>
          ) : (
            <div key={i} className="cb-msg cb-bot">
              {(m.cards ?? []).map((c, j) => <WordCard key={j} card={c} onLeave={leave} />)}
              {m.text ? <div className="cb-md"><Markdown text={m.text} /></div> : !m.error && busy && i === msgs.length - 1 ? <div className="cb-typing" aria-label="Đang trả lời"><span /><span /><span /></div> : null}
              {(m.missing ?? []).length ? <div className="cb-note">Không tìm thấy dữ liệu cho: {m.missing!.join(', ')}</div> : null}
              {(m.lessons ?? []).map((l) => (
                <div key={l.id} className="cb-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => { a.openGrammar(l.id); leave(); }}><Icon name="book" size="sm" />Mở bài {l.name}</button>
                  {NO_PRACTICE.has(l.id) ? null : <button className="btn btn-ghost btn-sm" onClick={() => { a.startGrammarPractice(l.id); close(); }}>Luyện 10 câu</button>}
                </div>
              ))}
              {m.error ? <div className="cb-error" role="alert"><Icon name="alert" size="sm" />{m.error}</div> : null}
            </div>
          )
        ))}
      </div>

      <form className="cb-form" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <textarea ref={inputRef} className="input" rows={1} value={input} maxLength={500} placeholder="Hỏi về một từ hoặc ngữ pháp…" aria-label="Câu hỏi"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); } }} />
        <button className="btn btn-primary cb-send" type="submit" disabled={busy || !input.trim()} aria-label="Gửi"><Icon name="right" /></button>
      </form>
    </section>
  );
}
