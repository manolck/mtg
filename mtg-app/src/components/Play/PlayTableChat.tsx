import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { PlayAction, PlayChatMessage, PlayerTableState } from '../../types/play';
import { composePlayChatAction, formatDiceResult } from '../../utils/playChat';
import { playUserColor } from '../../utils/playPlayerColors';

const HIDE_AFTER_MS = 5200;

interface PlayTableChatProps {
  messages: PlayChatMessage[];
  selfId: string;
  selfName?: string;
  players: Array<Pick<PlayerTableState, 'userId' | 'seatIndex' | 'displayName'>>;
  onSend: (action: Extract<PlayAction, { type: 'chat' }>) => void;
  newId?: () => string;
  disabled?: boolean;
}

function nextChatId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PlayTableChat({
  messages,
  selfId,
  selfName,
  players,
  onSend,
  newId = nextChatId,
  disabled,
}: PlayTableChatProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pulse, setPulse] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    if (!lastId) return;
    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), HIDE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [lastId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, hovered, focused, pulse]);

  const active = hovered || focused || pulse;
  const visibleMessages = messages.slice(-12);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (disabled) return;
    const result = composePlayChatAction({
      userId: selfId,
      id: newId(),
      text: draft,
      name: selfName,
      created: Date.now(),
    });
    if (!result) return;
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onSend(result.action);
    setDraft('');
    setError(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.currentTarget.blur();
    }
  };

  return (
    <div
      className={`relative w-[15.5rem] max-w-[46vw] pointer-events-none transition-opacity duration-300 ${
        active ? 'opacity-100' : 'opacity-0 group-hover/cmd:opacity-100'
      }`}
      data-testid="play-table-chat"
      data-active={active ? 'true' : 'false'}
    >
      <div
        ref={listRef}
        className={`absolute bottom-full left-0 right-0 mb-1 space-y-0.5 overflow-y-auto pr-0.5 rounded-xl bg-black/25 backdrop-blur-[2px] px-2 py-1.5 ${
          visibleMessages.length ? 'max-h-36' : 'hidden'
        } ${active ? 'pointer-events-auto' : ''}`}
        aria-live="polite"
      >
        {visibleMessages.map((message) => {
          const color = playUserColor(message.userId, players);
          const mine = message.userId === selfId;
          return (
            <p
              key={message.id}
              className="text-[11px] leading-snug text-white/90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >
              <span className="font-semibold" style={{ color }}>
                {message.name || 'Joueur'}
              </span>
              {message.dice ? (
                <>
                  <span className="text-white/50"> lance </span>
                  <span className={mine ? 'text-amber-200' : 'text-white/90'}>
                    {formatDiceResult(message.dice)}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-white/40"> : </span>
                  <span>{message.text}</span>
                </>
              )}
            </p>
          );
        })}
      </div>
      <form
        className="pointer-events-auto w-40 max-w-full rounded-xl bg-black/25 backdrop-blur-[2px] px-2 py-1"
        onSubmit={submit}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <input
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          maxLength={240}
          autoComplete="off"
          spellCheck={false}
          aria-label="Chat de table"
          placeholder="Message ou /r 1d20"
          className="w-full bg-transparent border-0 p-0 text-[11px] text-white placeholder:text-white/35 outline-none"
        />
        {error ? <p className="mt-0.5 text-[10px] text-amber-200/90">{error}</p> : null}
      </form>
    </div>
  );
}
