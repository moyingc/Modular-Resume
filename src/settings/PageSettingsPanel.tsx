'use client';

import type { PageSettings, SectionLayoutMode } from '../types/editor-ui.types';
import SectionLayoutSelector from '../modules/SectionLayoutSelector';
import styles from './PageSettingsPanel.module.css';
import { UI_MESSAGES, type UiLocale } from '../i18n/messages';
import type { ResumeTemplate } from '../core/templates';

export default function PageSettingsPanel({
  open,
  locale = 'zh',
  value,
  defaultShortWordLayout,
  templates = [],
  onChange,
  onTemplateSelect,
  onShortWordLayoutChange,
  onClose,
}: {
  open: boolean;
  locale?: UiLocale;
  value: PageSettings;
  defaultShortWordLayout: SectionLayoutMode;
  templates?: ResumeTemplate[];
  onChange: (patch: Partial<PageSettings>) => void;
  onTemplateSelect?: (templateId: string) => void;
  onShortWordLayoutChange: (layout: SectionLayoutMode) => void;
  mailConnection?: { connected: boolean; provider?: 'google'; account?: string; displayName?: string; providers?: { google: boolean } };
  mailConnectionLoading?: boolean;
  mailMessage?: string;
  onDisconnectMail?: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const ui = UI_MESSAGES[locale];

  return (
    <div className={styles.backdrop} role="presentation" onPointerDown={onClose}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-label={ui.pageSettings} onPointerDown={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div><h2>{ui.pageSettings}</h2><p>{ui.pageSettingsHint}</p></div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className={styles.grid}>
          <label className={styles.card}><span>{ui.paper}</span><select value={value.paperSize} onChange={(e)=>onChange({paperSize:e.target.value as PageSettings['paperSize']})}><option value="a4">A4</option><option value="letter">Letter</option></select></label>
          <label className={styles.card}><span>{ui.template}</span><select value={value.templateId} onChange={(e)=>onTemplateSelect?.(e.target.value)}>{templates.map((template)=>{ const displayName = template.localized?.[locale]?.name ?? template.name; return <option key={template.id} value={template.id}>{template.badge ? `${displayName} [${template.badge}]` : displayName}</option>; })}</select></label>
          <label className={styles.card}><span>{ui.font}</span><select value={value.fontFamily} onChange={(e)=>onChange({fontFamily:e.target.value as PageSettings['fontFamily']})}><option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option><option value="Georgia">Georgia</option><option value="Helvetica">Helvetica</option></select></label>
          <label className={styles.card}><span>{ui.bodyFontSize}</span><input type="number" min={7} max={20} step={0.5} value={value.bodyFontSize} onChange={(e)=>onChange({bodyFontSize:Number(e.target.value) || 10.5})}/></label>
          <label className={styles.card}><span>{ui.margin}</span><select value={value.marginPreset} onChange={(e)=>onChange({marginPreset:e.target.value as PageSettings['marginPreset']})}><option value="compact">{ui.compact}</option><option value="standard">{ui.standard}</option><option value="wide">{ui.wide}</option></select></label>
          <label className={styles.card}><span>{ui.density}</span><select value={value.density} onChange={(e)=>onChange({density:e.target.value as PageSettings['density']})}><option value="compact">{ui.compact}</option><option value="standard">{ui.standard}</option><option value="relaxed">{ui.relaxed}</option></select></label>
          <label className={styles.card}><span>{ui.targetPages}</span><select value={value.targetPages} onChange={(e)=>onChange({targetPages:e.target.value as PageSettings['targetPages']})}><option value="1">1 {locale === 'zh' ? '页' : 'page'}</option><option value="2">2 {locale === 'zh' ? '页' : 'pages'}</option><option value="none">{ui.unlimited}</option></select></label>
          <label className={styles.card}><span>{ui.exportFileName}</span><input value={value.exportFileName} onChange={(e)=>onChange({exportFileName:e.target.value})} placeholder="Name_Role_Resume"/></label>
        </div>

        <div className={styles.layoutBlock}>
          <div><strong>{ui.shortWordLayout}</strong><p>{ui.shortWordLayoutHint}</p></div>
          <SectionLayoutSelector value={defaultShortWordLayout} onChange={onShortWordLayoutChange} locale={locale}/>
        </div>

        <div className={styles.layoutBlock}>
          <div>
            <strong>{locale === 'zh' ? '邮件功能' : 'Email'}</strong>
            <p>{locale === 'zh' ? 'HR 测试版不包含 Gmail OAuth。邮件内容仍可生成，并可通过本机邮件客户端打开。' : 'Gmail OAuth is not included in the HR test build. Email content can still be generated and opened in the local email client.'}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
