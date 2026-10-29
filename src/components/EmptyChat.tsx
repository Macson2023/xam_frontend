import { ChatIcon } from './Icons';
import { Logo } from './Logo';

export function EmptyChat() {
  return (
    <section className="empty-chat">
      <div className="empty-chat__glow" aria-hidden="true" />
      <Logo size={64} />
      <h2>Выберите диалог</h2>
      <p>
        Откройте существующий чат слева или найдите пользователя по username, чтобы начать новую
        переписку.
      </p>
      <div className="empty-chat__tip">
        <ChatIcon width={18} height={18} />
        Новые сообщения приходят мгновенно и помечаются в списке диалогов.
      </div>
    </section>
  );
}
