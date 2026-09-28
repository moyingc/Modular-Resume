'use client';

import type { SectionLayoutMode } from '../types/editor-ui.types';
import type { UiLocale } from '../i18n/messages';
import styles from './SectionLayoutSelector.module.css';

const OPTIONS: Array<{ value: SectionLayoutMode; label: string; labelEn?: string; cells: number }> = [
  { value: 'list', label: '1×1', cells: 1 },
  { value: 'row-first-2col', label: 'row-first-2col', cells: 2 },
  { value: 'grid-2x2', label: '2×2', cells: 4 },
  { value: 'grid-2x3', label: '2×3', cells: 6 },
  { value: 'grid-3x3', label: '3×3', cells: 9 },
];

export default function SectionLayoutSelector({
  value,
  onChange,
  locale = 'zh',
}: {
  value: SectionLayoutMode;
  onChange: (value: SectionLayoutMode) => void;
  locale?: UiLocale;
}) {
  const labelFor = (option: (typeof OPTIONS)[number]) =>
    option.value === 'row-first-2col'
      ? (locale === 'zh' ? '顺序2列' : 'Row-first 2 columns')
      : option.label;

  return (
    <div className={styles.root} aria-label={locale === 'zh' ? '模块排列' : 'Section layout'}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`${styles.option} ${value === option.value ? styles.active : ''}`}
          onClick={() => onChange(option.value)}
          title={locale === 'zh' ? `排列 ${labelFor(option)}` : `Layout ${labelFor(option)}`}
          aria-pressed={value === option.value}
        >
          <span className={styles.icon} data-layout={option.value}>
            {Array.from({ length: option.cells }).map((_, index) => <i key={index} />)}
          </span>
          <span>{labelFor(option)}</span>
        </button>
      ))}
    </div>
  );
}
