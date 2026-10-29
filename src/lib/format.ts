const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

const shortDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
});

const weekdayFormatter = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
});

const fullDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function parseDate(value: string): Date {
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTimeZone ? value : `${value}Z`);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayDiff(date: Date, now = new Date()): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
}

export function formatTime(value: string | Date): string {
  return timeFormatter.format(typeof value === 'string' ? parseDate(value) : value);
}

export function formatChatTime(value: string): string {
  const date = parseDate(value);
  const diff = dayDiff(date);
  if (diff <= 0) {
    return formatTime(date);
  }
  if (diff === 1) {
    return 'вчера';
  }
  if (diff < 7) {
    return weekdayFormatter.format(date);
  }
  return shortDateFormatter.format(date);
}

export function formatDayLabel(value: string): string {
  const date = parseDate(value);
  const diff = dayDiff(date);
  if (diff === 0) {
    return 'Сегодня';
  }
  if (diff === 1) {
    return 'Вчера';
  }
  if (date.getFullYear() === new Date().getFullYear()) {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
  }
  return fullDateFormatter.format(date);
}

export function formatLastSeen(value: string | null): string {
  if (!value) {
    return 'не в сети';
  }
  const date = parseDate(value);
  const diff = dayDiff(date);
  if (diff === 0) {
    return `был(а) в сети в ${formatTime(date)}`;
  }
  if (diff === 1) {
    return `был(а) в сети вчера в ${formatTime(date)}`;
  }
  return `был(а) в сети ${shortDateFormatter.format(date)}`;
}

export function dayKey(value: string): string {
  const date = parseDate(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
