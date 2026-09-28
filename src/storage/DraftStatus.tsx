'use client';

import styles from './DraftStatus.module.css';
import { UI_MESSAGES, type UiLocale } from '../i18n/messages';

export default function DraftStatus({
  isSaving,
  locale = 'zh',
  lastSavedLabel,
  onSaveNow,
}: {
  isSaving: boolean;
  locale?: UiLocale;
  lastSavedLabel: string;
  onSaveNow: () => void;
}) {
  const ui = UI_MESSAGES[locale];

  return (
    <div className={styles.root}>
      <span className={`${styles.dot} ${isSaving ? styles.saving : ''}`} />
      <span>{isSaving ? ui.saving : `${ui.autosaved} · ${lastSavedLabel}`}</span>
      <button type="button" onClick={onSaveNow}>{ui.saveNow}</button>
    </div>
  );
}
