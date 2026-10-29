import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { IMAGE_ACCEPT, formatFileSize, validateImageFile } from '../lib/images';
import { AttachIcon, CloseIcon, SendIcon } from './Icons';

interface ComposerProps {
  onSend: (content: string) => void;
  onSendImage: (file: File, caption: string) => void;
  onTyping: () => void;
}

interface Attachment {
  file: File;
}

export function Composer({ onSend, onSendImage, onTyping }: ComposerProps) {
  const [value, setValue] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 168)}px`;
  }, [value]);

  useEffect(() => {
    if (!attachment) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachment.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  const selectFile = (file: File | null | undefined) => {
    if (!file) {
      return;
    }
    const problem = validateImageFile(file);
    if (problem) {
      setAttachmentError(problem);
      return;
    }
    setAttachmentError(null);
    setAttachment({ file });
    textareaRef.current?.focus();
  };

  const submit = () => {
    const caption = value.trim();
    const file = attachment?.file;
    if (!file && !caption) {
      return;
    }
    if (file) {
      onSendImage(file, caption);
      setAttachment(null);
    } else {
      onSend(caption);
    }
    setValue('');
    setAttachmentError(null);
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

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (Array.from(event.dataTransfer.types).includes('Files')) {
      event.preventDefault();
      setDragging(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = Array.from(event.dataTransfer.files).find((item) =>
      item.type.startsWith('image/'),
    );
    if (file) {
      selectFile(file);
    } else {
      setAttachmentError('Перетащите изображение JPEG, PNG, GIF или WEBP.');
    }
  };

  return (
    <div
      className={`composer-wrap${dragging ? ' is-dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {attachment ? (
        <div className="composer__attachment">
          {previewUrl ? (
            <img
              className="composer__attachment-thumb"
              src={previewUrl}
              alt="Предпросмотр изображения"
            />
          ) : null}
          <span className="composer__attachment-meta">
            <span className="composer__attachment-name">{attachment.file.name}</span>
            <span className="composer__attachment-size">
              {formatFileSize(attachment.file.size)}
            </span>
          </span>
          <button
            type="button"
            className="icon-button composer__attachment-remove"
            onClick={() => setAttachment(null)}
            aria-label="Убрать вложение"
            title="Убрать вложение"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>
      ) : null}

      {attachmentError ? (
        <div className="composer__error" role="alert">
          {attachmentError}
        </div>
      ) : null}

      <form className="composer" onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          className="composer__file-input"
          type="file"
          accept={IMAGE_ACCEPT}
          onChange={(event) => {
            selectFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className="icon-button composer__attach"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Прикрепить изображение"
          title="Прикрепить изображение"
        >
          <AttachIcon width={20} height={20} />
        </button>
        <textarea
          ref={textareaRef}
          className="composer__input"
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={(event) => {
            const file = Array.from(event.clipboardData.files).find((item) =>
              item.type.startsWith('image/'),
            );
            if (file) {
              event.preventDefault();
              selectFile(file);
            }
          }}
          placeholder={attachment ? 'Добавить подпись…' : 'Написать сообщение…'}
          rows={1}
          maxLength={4000}
          aria-label={attachment ? 'Подпись к изображению' : 'Текст сообщения'}
        />
        <button
          type="submit"
          className="composer__send"
          disabled={!value.trim() && !attachment}
          aria-label={attachment ? 'Отправить изображение' : 'Отправить сообщение'}
          title={attachment ? 'Отправить изображение (Enter)' : 'Отправить (Enter)'}
        >
          <SendIcon width={20} height={20} />
        </button>
      </form>
      <div className="composer__hint">
        <span>
          {attachment
            ? 'Подпись необязательна, Enter — отправить'
            : 'Enter — отправить, Shift+Enter — новая строка'}
        </span>
        {value.length > 3500 ? <span>{value.length}/4000</span> : null}
      </div>
    </div>
  );
}
