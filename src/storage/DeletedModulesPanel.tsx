'use client';

import type { DeletedModuleItem } from '../types/editor-ui.types';
import styles from './DeletedModulesPanel.module.css';
import { UI_MESSAGES, type UiLocale } from '../i18n/messages';

function remainingLabel(expiresAt: string, locale: UiLocale) {
  const ui = UI_MESSAGES[locale];
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return ui.expired;
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return days > 0
    ? ui.remainingDays(days, hours)
    : ui.remainingHours(hours);
}

export default function DeletedModulesPanel<TModule>({
  open,
  locale = 'zh',
  items,
  onClose,
  onRestore,
  onDeleteForever,
}: {
  open: boolean;
  locale?: UiLocale;
  items: DeletedModuleItem<TModule>[];
  onClose: () => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
}) {
  if (!open) return null;

  const ui = UI_MESSAGES[locale];

  return (
    <aside className={styles.panel} aria-label={ui.deletedModules}>
      <header>
        <div><h3>{ui.deletedModules}</h3><p>{ui.deletedHint}</p></div>
        <button type="button" onClick={onClose}>×</button>
      </header>
      <div className={styles.list}>
        {items.length === 0 ? <p className={styles.empty}>{ui.noDeleted}</p> : items.map((item) => (
          <article key={item.id} className={styles.item}>
            <div className={styles.meta}>
              <strong>{(item.module as {title?: string}).title ?? ui.unnamedModule}</strong>
              <span>{ui.deletedAt} {new Date(item.deletedAt).toLocaleString()}</span>
              <small>{remainingLabel(item.expiresAt, locale)}</small>
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={() => onRestore(item.id)}>{ui.restore}</button>
              <button type="button" className={styles.danger} onClick={() => onDeleteForever(item.id)}>{ui.deleteForever}</button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
