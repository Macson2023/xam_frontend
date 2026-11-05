import { resolveMediaUrl } from '../api/client';
import type { AvatarSource } from '../lib/chat';

interface AvatarProps {
  user: AvatarSource;
  size?: number;
  status?: 'online' | 'offline';
  shape?: 'circle' | 'rounded';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) % 360;
  }
  return result;
}

export function Avatar({ user, size = 44, status, shape = 'circle' }: AvatarProps) {
  const seed = user.id || user.username || user.display_name || '?';
  const hue = hash(seed);
  const background = `linear-gradient(135deg, hsl(${hue} 68% 56%), hsl(${(hue + 48) % 360} 72% 42%))`;
  const label = user.display_name || user.username || '?';
  const image = resolveMediaUrl(user.avatar_url);

  return (
    <span
      className={`avatar${shape === 'rounded' ? ' avatar--rounded' : ''}`}
      style={{
        width: size,
        height: size,
        background: image ? undefined : background,
        borderRadius: shape === 'rounded' ? Math.max(10, size * 0.28) : undefined,
      }}
      title={label}
    >
      {image ? (
        <img
          className={`avatar__image${shape === 'rounded' ? ' avatar__image--rounded' : ''}`}
          src={image}
          alt={label}
          style={{ borderRadius: shape === 'rounded' ? Math.max(10, size * 0.28) : undefined }}
        />
      ) : (
        <span className="avatar__initials" style={{ fontSize: Math.max(11, size * 0.36) }}>
          {initials(label)}
        </span>
      )}
      {status ? <span className={`avatar__status avatar__status--${status}`} /> : null}
    </span>
  );
}
