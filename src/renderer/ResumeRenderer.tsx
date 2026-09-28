'use client';

import type { ReactNode } from 'react';
import styles from './ResumeRenderer.module.css';
import { UI_MESSAGES, type UiLocale } from '../i18n/messages';

export default function ResumeRenderer({
  children,
  locale = 'zh',
  pageCount = 1,
  pageIndex = 0,
  usagePercent = 84,
  fitStatus = 'safe',
  fitLabel,
  pdfDirty = true,
  pdfRendering = false,
  pdfHasFile = false,
  onUpdatePdf,
  onPageChange,
  onOpenSettings,
}: {
  children: ReactNode;
  locale?: UiLocale;
  pageCount?: number;
  pageIndex?: number;
  usagePercent?: number;
  fitStatus?: 'safe' | 'warning' | 'overflow';
  fitLabel?: string;
  pdfDirty?: boolean;
  pdfRendering?: boolean;
  pdfHasFile?: boolean;
  onUpdatePdf: () => void;
  onPageChange?: (page: number) => void;
  onOpenSettings: () => void;
}) {
  const ui = UI_MESSAGES[locale];
  const resolvedFitLabel = fitLabel ?? ui.pageSafe;

  const pdfStatus = pdfRendering
    ? ui.rendering
    : !pdfHasFile
      ? ui.pdfNotGenerated
      : pdfDirty
        ? ui.pdfDirty
        : ui.pdfSynced;

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.pageNav}>
          <button
            type="button"
            disabled={pageIndex <= 0}
            onClick={() => onPageChange?.(Math.max(0, pageIndex - 1))}
          >
            ‹
          </button>

          <strong>
            {pageCount ? `${pageIndex + 1} / ${pageCount}` : '0 / 0'}
          </strong>

          <button
            type="button"
            disabled={pageIndex >= pageCount - 1}
            onClick={() =>
              onPageChange?.(Math.min(pageCount - 1, pageIndex + 1))
            }
          >
            ›
          </button>
        </div>

        <div className={styles.toolbarActions}>
          <span className={styles.pdfStatus}>{pdfStatus}</span>

          <button
            type="button"
            className={styles.updatePdfButton}
            disabled={pdfRendering || (!pdfDirty && pdfHasFile)}
            onClick={onUpdatePdf}
          >
            {pdfRendering
              ? ui.rendering
              : pdfHasFile
                ? ui.updatePdf
                : ui.generatePdf}
          </button>

          <button
            type="button"
            className={styles.settings}
            onClick={onOpenSettings}
          >
            {ui.pageSettings}
          </button>
        </div>
      </div>

      <div className={styles.stage}>{children}</div>

      <div className={styles.footer}>
        <span>{ui.page} {pageIndex + 1}</span>

        <div className={styles.footerStatus}>
          <span>{ui.currentUsage} {usagePercent}%</span>
          <span
            className={`${styles.fitBadge} ${styles[`fit_${fitStatus}`]}`}
          >
            {resolvedFitLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
