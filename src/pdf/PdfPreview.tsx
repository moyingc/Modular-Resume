'use client';

import styles from './PdfPreview.module.css';
import { UI_MESSAGES, type UiLocale } from '../i18n/messages';

export default function PdfPreview({
  url,
  pageIndex,
  isRendering,
  dirty,
  error,
  locale = 'zh',
}: {
  url: string;
  pageIndex: number;
  isRendering: boolean;
  dirty: boolean;
  error: string;
  locale?: UiLocale;
}) {
  const ui = UI_MESSAGES[locale];
  if (!url) {
    return (
      <div className={styles.state}>
        <strong>
          {isRendering ? ui.pdfGenerating : ui.pdfNotGeneratedTitle}
        </strong>
        <p>
          {error
            ? error
            : ui.pdfNotGeneratedHint}
        </p>
      </div>
    );
  }

  const src = `${url}#page=${pageIndex + 1}&zoom=page-width&toolbar=0&navpanes=0`;

  return (
    <div className={styles.root}>
      <iframe
        key={src}
        className={styles.frame}
        src={src}
        title={locale === 'zh' ? `PDF 简历预览，第 ${pageIndex + 1} 页` : `PDF resume preview, page ${pageIndex + 1}`}
      />

      {(isRendering || dirty || error) && (
        <div className={styles.statusOverlay}>
          {isRendering
            ? ui.pdfUpdatingOld
            : error
              ? (locale === 'zh' ? `PDF 更新失败：${error}` : `PDF update failed: ${error}`)
              : ui.pdfDirtyHint}
        </div>
      )}
    </div>
  );
}
