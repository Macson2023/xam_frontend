export type MediaKind = 'audio' | 'video_note';

export const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_NOTE_SIZE_BYTES = 25 * 1024 * 1024;
export const MIN_MEDIA_DURATION_SECONDS = 1;
export const MAX_MEDIA_DURATION_SECONDS = 3600;

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
];

const VIDEO_NOTE_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

const MIME_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};

export function mediaSizeLimit(kind: MediaKind): number {
  return kind === 'audio' ? MAX_AUDIO_SIZE_BYTES : MAX_VIDEO_NOTE_SIZE_BYTES;
}

export function pickRecorderMimeType(kind: MediaKind): string | undefined {
  if (typeof MediaRecorder === 'undefined') {
    return undefined;
  }
  const supported =
    typeof MediaRecorder.isTypeSupported === 'function'
      ? (mimeType: string) => MediaRecorder.isTypeSupported(mimeType)
      : () => false;
  const candidates = kind === 'audio' ? AUDIO_MIME_CANDIDATES : VIDEO_NOTE_MIME_CANDIDATES;
  return candidates.find(supported);
}

export function extensionForMimeType(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return MIME_EXTENSIONS[base] ?? 'webm';
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  const safe = totalSeconds && Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const rounded = Math.floor(safe);
  const seconds = rounded % 60;
  const minutes = Math.floor(rounded / 60) % 60;
  const hours = Math.floor(rounded / 3600);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
