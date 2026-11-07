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
import {
  MAX_MEDIA_DURATION_SECONDS,
  extensionForMimeType,
  formatDuration,
  mediaSizeLimit,
  pickRecorderMimeType,
  type MediaKind,
} from '../lib/media';
import {
  AttachIcon,
  CloseIcon,
  MicIcon,
  SendIcon,
  VideoNoteIcon,
} from './Icons';

interface ComposerProps {
  onSend: (content: string) => void;
  onSendImage: (file: File, caption: string) => void;
  onSendAudio: (file: File, durationSeconds: number) => void;
  onSendVideoNote: (file: File, durationSeconds: number) => void;
  onTyping: () => void;
}

interface Attachment {
  file: File;
}

interface RecordingDraft {
  kind: MediaKind;
  file: File;
  url: string;
  duration: number;
}

type StopReason = 'send' | 'cancel' | 'limit';

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function recordingErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'Доступ к микрофону или камере запрещён. Разрешите его в настройках браузера.';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'Микрофон или камера не найдены.';
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'Устройство занято другим приложением. Закройте его и попробуйте снова.';
    }
  }
  return 'Не удалось начать запись. Проверьте доступ к микрофону и камере.';
}

function LiveStreamPreview({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className="composer__recording-preview"
      autoPlay
      muted
      playsInline
      aria-hidden="true"
    />
  );
}

export function Composer({
  onSend,
  onSendImage,
  onSendAudio,
  onSendVideoNote,
  onTyping,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [startingKind, setStartingKind] = useState<MediaKind | null>(null);
  const [recordingKind, setRecordingKind] = useState<MediaKind | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecordingDraft | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chunksBytesRef = useRef(0);
  const startedAtRef = useRef(0);
  const stopReasonRef = useRef<StopReason>('send');
  const timerRef = useRef<number | null>(null);
  const cancelStartingRef = useRef(false);
  const startingRef = useRef(false);
  const draftUrlRef = useRef<string | null>(null);

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

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        stopReasonRef.current = 'cancel';
        recorder.stop();
      }
      stopStream(streamRef.current);
      if (draftUrlRef.current) {
        URL.revokeObjectURL(draftUrlRef.current);
      }
    };
  }, []);

  const clearRecordingTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const finalizeRecording = (kind: MediaKind) => {
    clearRecordingTimer();
    const recorder = recorderRef.current;
    const reason = stopReasonRef.current;
    const elapsedMs = startedAtRef.current > 0 ? performance.now() - startedAtRef.current : 0;
    const mimeType =
      recorder?.mimeType ||
      chunksRef.current[0]?.type ||
      (kind === 'audio' ? 'audio/webm' : 'video/webm');
    const chunks = chunksRef.current;

    recorderRef.current = null;
    chunksRef.current = [];
    chunksBytesRef.current = 0;
    startedAtRef.current = 0;
    stopReasonRef.current = 'send';
    stopStream(streamRef.current);
    streamRef.current = null;
    setPreviewStream(null);
    setRecordingKind(null);
    setStartingKind(null);
    setElapsed(0);

    if (reason === 'cancel') {
      return;
    }
    if (reason === 'limit') {
      setRecordError(
        elapsedMs >= MAX_MEDIA_DURATION_SECONDS * 1000
          ? `Максимальная длительность записи — ${formatDuration(MAX_MEDIA_DURATION_SECONDS)}.`
          : `Запись превысила лимит ${formatFileSize(mediaSizeLimit(kind))}.`,
      );
      return;
    }
    if (elapsedMs < 1000) {
      setRecordError('Слишком короткая запись — минимум 1 секунда.');
      return;
    }

    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size === 0) {
      setRecordError('Запись не содержит данных. Попробуйте снова.');
      return;
    }
    if (blob.size > mediaSizeLimit(kind)) {
      setRecordError(`Запись превысила лимит ${formatFileSize(mediaSizeLimit(kind))}.`);
      return;
    }

    const extension = extensionForMimeType(mimeType);
    const file = new File(
      [blob],
      `${kind === 'audio' ? 'voice' : 'video-note'}-${Date.now()}.${extension}`,
      { type: mimeType },
    );
    const url = URL.createObjectURL(blob);
    draftUrlRef.current = url;
    setDraft({
      kind,
      file,
      url,
      duration: Math.max(1, Math.min(MAX_MEDIA_DURATION_SECONDS, Math.round(elapsedMs / 1000))),
    });
  };

  const startRecording = async (kind: MediaKind) => {
    if (startingRef.current || recorderRef.current || draft || attachment) {
      if (draft || attachment) {
        setRecordError('Сначала отправьте или уберите текущее вложение.');
      }
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordError(
        'Запись медиа не поддерживается этим браузером или требует защищённого соединения (HTTPS).',
      );
      return;
    }

    setRecordError(null);
    setAttachmentError(null);
    startingRef.current = true;
    cancelStartingRef.current = false;
    setStartingKind(kind);
    setElapsed(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'audio'
          ? { audio: true }
          : {
              audio: true,
              video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
            },
      );
      if (cancelStartingRef.current) {
        stopStream(stream);
        setStartingKind(null);
        return;
      }

      const mimeType = pickRecorderMimeType(kind);
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      chunksBytesRef.current = 0;
      stopReasonRef.current = 'send';
      startedAtRef.current = performance.now();

      let finished = false;
      const finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        finalizeRecording(kind);
      };

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) {
          return;
        }
        chunksRef.current.push(event.data);
        chunksBytesRef.current += event.data.size;
        if (chunksBytesRef.current > mediaSizeLimit(kind) && recorder.state !== 'inactive') {
          stopReasonRef.current = 'limit';
          recorder.stop();
        }
      };
      recorder.onstop = finish;
      recorder.onerror = () => {
        stopReasonRef.current = 'cancel';
        finish();
      };

      recorder.start(1000);
      setStartingKind(null);
      setRecordingKind(kind);
      setPreviewStream(kind === 'video_note' ? stream : null);
      timerRef.current = window.setInterval(() => {
        const seconds = (performance.now() - startedAtRef.current) / 1000;
        setElapsed(seconds);
        if (seconds >= MAX_MEDIA_DURATION_SECONDS && recorder.state !== 'inactive') {
          stopReasonRef.current = 'limit';
          recorder.stop();
        }
      }, 200);
    } catch (error) {
      stopStream(streamRef.current);
      streamRef.current = null;
      setPreviewStream(null);
      setStartingKind(null);
      setRecordingKind(null);
      setRecordError(recordingErrorMessage(error));
    } finally {
      startingRef.current = false;
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      stopReasonRef.current = 'send';
      recorder.stop();
    }
  };

  const cancelRecording = () => {
    stopReasonRef.current = 'cancel';
    cancelStartingRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else if (!recorder) {
      clearRecordingTimer();
      stopStream(streamRef.current);
      streamRef.current = null;
      setPreviewStream(null);
      setStartingKind(null);
      setRecordingKind(null);
      setElapsed(0);
    }
  };

  const sendDraft = () => {
    if (!draft) {
      return;
    }
    if (draft.kind === 'audio') {
      onSendAudio(draft.file, draft.duration);
    } else {
      onSendVideoNote(draft.file, draft.duration);
    }
    URL.revokeObjectURL(draft.url);
    draftUrlRef.current = null;
    setDraft(null);
    textareaRef.current?.focus();
  };

  const discardDraft = () => {
    if (!draft) {
      return;
    }
    URL.revokeObjectURL(draft.url);
    draftUrlRef.current = null;
    setDraft(null);
  };

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

  const recording = recordingKind ?? startingKind;
  const draftSize = draft ? formatFileSize(draft.file.size) : '';

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

      {recordError ? (
        <div className="composer__error" role="alert">
          {recordError}
        </div>
      ) : null}

      {recording ? (
        <div className="composer composer--recording">
          {recording === 'video_note' && previewStream ? (
            <LiveStreamPreview stream={previewStream} />
          ) : (
            <span className="composer__recording-dot" aria-hidden="true" />
          )}
          <span className="composer__recording-info">
            <span className="composer__recording-title">
              {startingKind
                ? 'Запрос доступа к микрофону…'
                : recording === 'audio'
                  ? 'Запись аудиосообщения'
                  : 'Запись видеокружка'}
            </span>
            <span className="composer__recording-time">{formatDuration(elapsed)}</span>
          </span>
          <button
            type="button"
            className="icon-button composer__recording-cancel"
            onClick={cancelRecording}
            aria-label="Отменить запись"
            title="Отменить запись"
          >
            <CloseIcon width={18} height={18} />
          </button>
          <button
            type="button"
            className="composer__send"
            onClick={stopRecording}
            disabled={Boolean(startingKind)}
            aria-label="Завершить запись и отправить"
            title="Завершить запись"
          >
            <SendIcon width={20} height={20} />
          </button>
        </div>
      ) : draft ? (
        <div className="composer composer--draft">
          {draft.kind === 'audio' ? (
            <audio className="composer__draft-audio" src={draft.url} controls preload="metadata" />
          ) : (
            <video
              className="composer__draft-video"
              src={draft.url}
              controls
              playsInline
              preload="metadata"
            />
          )}
          <span className="composer__attachment-meta">
            <span className="composer__attachment-name">
              {draft.kind === 'audio' ? 'Аудиосообщение' : 'Видеокружок'}
            </span>
            <span className="composer__attachment-size">
              {formatDuration(draft.duration)} · {draftSize}
            </span>
          </span>
          <button
            type="button"
            className="icon-button composer__attachment-remove"
            onClick={discardDraft}
            aria-label="Удалить запись"
            title="Удалить запись"
          >
            <CloseIcon width={16} height={16} />
          </button>
          <button
            type="button"
            className="composer__send"
            onClick={sendDraft}
            aria-label={draft.kind === 'audio' ? 'Отправить аудиосообщение' : 'Отправить видеокружок'}
            title="Отправить"
          >
            <SendIcon width={20} height={20} />
          </button>
        </div>
      ) : (
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
          <button
            type="button"
            className="icon-button composer__attach"
            onClick={() => void startRecording('audio')}
            aria-label="Записать аудиосообщение"
            title="Записать аудиосообщение"
          >
            <MicIcon width={19} height={19} />
          </button>
          <button
            type="button"
            className="icon-button composer__attach"
            onClick={() => void startRecording('video_note')}
            aria-label="Записать видеокружок"
            title="Записать видеокружок"
          >
            <VideoNoteIcon width={20} height={20} />
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
      )}
      <div className="composer__hint">
        <span>
          {recording
            ? 'Нажмите на кнопку отправки, чтобы завершить запись'
            : draft
              ? 'Прослушайте запись и отправьте или удалите её'
              : attachment
                ? 'Подпись необязательна, Enter — отправить'
                : 'Enter — отправить, Shift+Enter — новая строка'}
        </span>
        {value.length > 3500 ? <span>{value.length}/4000</span> : null}
      </div>
    </div>
  );
}
