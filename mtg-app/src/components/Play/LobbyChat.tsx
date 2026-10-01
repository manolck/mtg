import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { PlayChatMessage, PlaySeat } from '../../types/play';
import { composePlayChatAction, formatDiceResult } from '../../utils/playChat';
import { playUserColor } from '../../utils/playPlayerColors';

interface LobbyChatProps {
  messages: PlayChatMessage[];
  selfId?: string;
  selfName?: string;
  seats: PlaySeat[];
  disabled?: boolean;
  onSend: (message: PlayChatMessage) => void | Promise<void>;
}

function nextChatId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function LobbyChat({
  messages,
  selfId,
  selfName,
  seats,
  disabled,
  onSend,
}: LobbyChatProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const players = seats.map((seat) => ({
    userId: seat.userId,
    seatIndex: seat.seatIndex,
    displayName: seat.displayName,
  }));

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (disabled || sending || !selfId) return;
    const result = composePlayChatAction({
      userId: selfId,
      id: nextChatId(),
      text: draft,
      name: selfName,
      created: Date.now(),
    });
    if (!result) return;
    if ('error' in result) {
      setError(result.error);
      return;
    }
    const action = result.action;
    const message: PlayChatMessage = {
      id: action.id,
      userId: action.userId,
      name: action.name || selfName || 'Joueur',
      text: action.text,
      created: action.created || Date.now(),
      ...(action.dice ? { dice: action.dice } : {}),
    };
    try {
      setSending(true);
      await onSend(message);
      setDraft('');
      setError(null);
    } catch {
      setError('Envoi impossible.');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.currentTarget.blur();
    }
  };

  return (
    <div
      className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col min-h-[320px] h-full overflow-hidden"
      data-testid="lobby-chat"
    >
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white">Chat</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Discutez avant le lancement · /r 1d20
        </p>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Aucun message pour l’instant.</p>
        ) : (
          messages.map((message) => {
            const color = playUserColor(message.userId, players);
            const mine = selfId != null && message.userId === selfId;
            return (
              <p key={message.id} className="text-sm leading-snug text-gray-800 dark:text-gray-100">
                <span className="font-semibold" style={{ color }}>
                  {message.name || 'Joueur'}
                </span>
                {message.dice ? (
                  <>
                    <span className="text-gray-400 dark:text-gray-500"> lance </span>
                    <span className={mine ? 'text-amber-700 dark:text-amber-300' : ''}>
                      {formatDiceResult(message.dice)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-gray-400 dark:text-gray-500"> : </span>
                    <span>{message.text}</span>
                  </>
                )}
              </p>
            );
          })
        )}
      </div>

      <form
        className="border-t border-gray-200 dark:border-gray-700 px-3 py-2"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <input
          value={draft}
          disabled={disabled || !selfId || sending}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          maxLength={240}
          autoComplete="off"
          spellCheck={false}
          aria-label="Chat du lobby"
          placeholder={selfId ? 'Message ou /r 1d20' : 'Connectez-vous pour discuter'}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/60 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-400/50 disabled:opacity-60"
        />
        {error ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{error}</p> : null}
      </form>
    </div>
  );
}
