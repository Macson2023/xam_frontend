import type { User } from '../api/types';

interface AvatarProps {
  user: User;
  size?: number;
  status?: 'online' | 'offline';
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

export function Avatar({ user, size = 44, status }: AvatarProps) {
  const hue = hash(user.id || user.username);
  const background = `linear-gradient(135deg, hsl(${hue} 68% 56%), hsl(${(hue + 48) % 360} 72% 42%))`;

  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: user.avatar_url ? undefined : background }}
      title={user.display_name}
    >
      {user.avatar_url ? (
        <img className="avatar__image" src={user.avatar_url} alt={user.display_name} />
      ) : (
        <span className="avatar__initials" style={{ fontSize: Math.max(11, size * 0.36) }}>
          {initials(user.display_name || user.username)}
        </span>
      )}
      {status ? <span className={`avatar__status avatar__status--${status}`} /> : null}
    </span>
  );
}
