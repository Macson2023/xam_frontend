import { ChatIcon } from './Icons';
import { Logo } from './Logo';

export function EmptyChat() {
  return (
    <section className="empty-chat">
      <div className="empty-chat__glow" aria-hidden="true" />
      <Logo size={64} />
      <h2>Выберите чат</h2>
      <p>
        Откройте диалог, группу или канал слева. Новый чат можно начать через поиск
        пользователя, кнопки «Группа» и «Канал».
      </p>
      <div className="empty-chat__tip">
        <ChatIcon width={18} height={18} />
        Новые сообщения приходят мгновенно и помечаются в списке чатов.
      </div>
    </section>
  );
}
