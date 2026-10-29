import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { SendIcon } from './Icons';

interface ComposerProps {
  onSend: (content: string) => void;
  onTyping: () => void;
}

export function Composer({ onSend, onTyping }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 168)}px`;
  }, [value]);

  const submit = () => {
    const content = value.trim();
    if (!content) {
      return;
    }
    onSend(content);
    setValue('');
    textareaRef.current?.focus();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const handleChange = (next: string) => {
    setValue(next);
    if (next.trim()) {
      onTyping();
    }
  };

  return (
    <div className="composer-wrap">
      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className="composer__input"
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Написать сообщение…"
          rows={1}
          maxLength={4000}
          aria-label="Текст сообщения"
        />
        <button
          type="submit"
          className="composer__send"
          disabled={!value.trim()}
          aria-label="Отправить сообщение"
          title="Отправить (Enter)"
        >
          <SendIcon width={20} height={20} />
        </button>
      </form>
      <div className="composer__hint">
        <span>Enter — отправить, Shift+Enter — новая строка</span>
        {value.length > 3500 ? <span>{value.length}/4000</span> : null}
      </div>
    </div>
  );
}
