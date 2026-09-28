'use client';

import {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';

import type { ResumeDocument, ResumeModule } from '../core/resume/types';
import { canPackSkillInHalfRow, parseAlignedResumeLine } from '../core/resume/renderLayout';
import { parseMarkdownResume as parseImportedMarkdownResume, parseDocxResume } from '../core/importing/resumeImporter';
import { parseBulletImportText } from '../core/importing/bulletImporter';
import { mockResume } from '../data/mockResume';
import styles from './ModularResumeWorkbench.module.css';
import PageSettingsPanel from '../settings/PageSettingsPanel';
import DraftStatus from '../storage/DraftStatus';
import DeletedModulesPanel from '../storage/DeletedModulesPanel';
import ResumeRenderer from '../renderer/ResumeRenderer';
import PdfPreview from '../pdf/PdfPreview';
import { useResumePdf } from '../pdf/useResumePdf';
import SectionLayoutSelector from '../modules/SectionLayoutSelector';
import type { DeletedModuleItem, PageSettings, SectionLayoutMode } from '../types/editor-ui.types';
import { DELETED_RETENTION_DAYS, DELETED_STORAGE_KEY, DRAFT_STORAGE_KEY } from '../storage/draftStore';
import { UI_MESSAGES, type UiLocale } from '../i18n/messages';
import { analyzeTargeting, applyRecommendedSelection, applySummaryRecommendationSelection, applyRecommendationScores, availablePageHeightPoints, buildRenderResume, buildResumeLayoutPlan, countSelectedContentUnits, diagnoseLayoutPressure, estimateContentSlots, estimateRenderedHeightPoints, optimizeWholeResumeForPageTarget, type ModuleAttention, type ModuleRecommendation, type TargetingAnalysis } from '../core/targeting';
import { validateAtsFormat, inspectPdfTextIntegrity, type PdfIntegrityReport } from '../core/ats';
import { buildApplicationSummary, buildCoverLetterPlan, buildApplicationEmailDraft, buildMiniCoverNote, parseContactLine, detectApplicationLogicClosure, inferJdApplicationEmail, inferJdJobTitle, type ApplicationPackageRecord, type CoverLetterLength } from '../core/application';
import { createTemplateFromCurrent, loadTemplates, saveTemplate, downloadTemplate, importTemplateFile, resolveTemplate, type ResumeTemplate } from '../core/templates';

function createModuleId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateModuleTree(
  modules: ResumeModule[],
  targetId: string,
  patch: Partial<ResumeModule>,
): ResumeModule[] {
  return modules.map((module) => {
    if (module.id === targetId) return { ...module, ...patch };
    if (!module.children) return module;
    return { ...module, children: updateModuleTree(module.children, targetId, patch) };
  });
}


function setSelectableSubtree(module: ResumeModule, selected: boolean): ResumeModule {
  if (module.locked) return module;
  const children = module.children?.map((child) => setSelectableSubtree(child, selected));
  return {
    ...module,
    selected,
    ...(children ? { children } : {}),
  };
}

function toggleSelectionTree(
  modules: ResumeModule[],
  targetId: string,
  nextSelected: boolean,
): ResumeModule[] {
  const visit = (module: ResumeModule): { module: ResumeModule; changed: boolean } => {
    if (module.id === targetId) {
      return {
        module: setSelectableSubtree(module, nextSelected),
        changed: true,
      };
    }

    if (!module.children?.length) return { module, changed: false };

    let childChanged = false;
    const children = module.children.map((child) => {
      const result = visit(child);
      childChanged ||= result.changed;
      return result.module;
    });

    if (!childChanged) return { module, changed: false };

    // Container selection is derived from descendants. This prevents impossible
    // UI states such as a selected Work Experience entry with zero selected bullets.
    const derivedSelected = children.some((child) => child.selected);
    return {
      module: {
        ...module,
        selected: derivedSelected,
        children,
      },
      changed: true,
    };
  };

  return modules.map((module) => visit(module).module);
}

function setModuleLockTree(
  modules: ResumeModule[],
  targetId: string,
  locked: boolean,
): ResumeModule[] {
  const lockSubtree = (module: ResumeModule): ResumeModule => ({
    ...module,
    locked,
    children: module.children?.map(lockSubtree),
  });

  return modules.map((module) => {
    if (module.id === targetId) return lockSubtree(module);
    if (!module.children) return module;
    return { ...module, children: setModuleLockTree(module.children, targetId, locked) };
  });
}

function appendChildToTree(
  modules: ResumeModule[],
  parentId: string,
  child: ResumeModule,
): ResumeModule[] {
  return modules.map((module) => {
    if (module.id === parentId) {
      return { ...module, children: [...(module.children ?? []), child] };
    }
    if (!module.children) return module;
    return { ...module, children: appendChildToTree(module.children, parentId, child) };
  });
}

function prependChildToTree(
  modules: ResumeModule[],
  parentId: string,
  child: ResumeModule,
): ResumeModule[] {
  return modules.map((module) => {
    if (module.id === parentId) {
      return { ...module, children: [child, ...(module.children ?? [])] };
    }
    if (!module.children) return module;
    const nextChildren = prependChildToTree(module.children, parentId, child);
    const changed = nextChildren.some((nextChild, index) => nextChild !== module.children?.[index]);
    return changed ? { ...module, children: nextChildren } : module;
  });
}

function prependChildrenToTree(
  modules: ResumeModule[],
  parentId: string,
  children: ResumeModule[],
): ResumeModule[] {
  return modules.map((module) => {
    if (module.id === parentId) {
      return { ...module, selected: true, children: [...children, ...(module.children ?? [])] };
    }
    if (!module.children) return module;
    const nextChildren = prependChildrenToTree(module.children, parentId, children);
    const changed = nextChildren.some((nextChild, index) => nextChild !== module.children?.[index]);
    return changed ? { ...module, selected: true, children: nextChildren } : module;
  });
}

function removeModuleFromTree(modules: ResumeModule[], targetId: string): ResumeModule[] {
  return modules
    .filter((module) => module.id !== targetId)
    .map((module) =>
      module.children
        ? { ...module, children: removeModuleFromTree(module.children, targetId) }
        : module,
    );
}

function findModuleLocation(
  modules: ResumeModule[],
  targetId: string,
  parentId: string | null = null,
): { module: ResumeModule; parentId: string | null; index: number } | null {
  for (let index = 0; index < modules.length; index += 1) {
    const resumeModule = modules[index];
    if (resumeModule.id === targetId) return { module: resumeModule, parentId, index };
    if (resumeModule.children) {
      const found = findModuleLocation(resumeModule.children, targetId, resumeModule.id);
      if (found) return found;
    }
  }
  return null;
}

function insertModuleAt(
  modules: ResumeModule[],
  parentId: string | null,
  index: number,
  moduleToInsert: ResumeModule,
): ResumeModule[] {
  if (parentId === null) {
    const copy = [...modules];
    copy.splice(Math.max(0, Math.min(index, copy.length)), 0, moduleToInsert);
    return copy;
  }

  return modules.map((module) => {
    if (module.id === parentId) {
      const children = [...(module.children ?? [])];
      children.splice(Math.max(0, Math.min(index, children.length)), 0, moduleToInsert);
      return { ...module, children };
    }
    if (!module.children) return module;
    return { ...module, children: insertModuleAt(module.children, parentId, index, moduleToInsert) };
  });
}

function reorderSiblingTree(
  modules: ResumeModule[],
  activeId: string,
  overId: string,
): ResumeModule[] {
  const activeIndex = modules.findIndex((module) => module.id === activeId);
  const overIndex = modules.findIndex((module) => module.id === overId);

  if (activeIndex !== -1 && overIndex !== -1) {
    return arrayMove(modules, activeIndex, overIndex);
  }

  return modules.map((module) =>
    module.children
      ? { ...module, children: reorderSiblingTree(module.children, activeId, overId) }
      : module,
  );
}

function countModules(modules: ResumeModule[]): { total: number; selected: number } {
  return modules.reduce(
    (acc, module) => {
      const childCount = module.children
        ? countModules(module.children)
        : { total: 0, selected: 0 };
      return {
        total: acc.total + 1 + childCount.total,
        selected: acc.selected + (module.selected ? 1 : 0) + childCount.selected,
      };
    },
    { total: 0, selected: 0 },
  );
}

function hasCompactShortSkillCandidates(module: ResumeModule) {
  if (module.kind !== 'entry') return false;
  const skills = (module.children ?? []).filter((child) => child.selected && child.kind === 'skill');
  if (skills.length < 2) return false;
  // Conservative nominal half-width for the editor control. The actual preview/PDF
  // recomputes packing from the rendered entry width.
  return skills.some((skill, index) => {
    const next = skills[index + 1];
    return Boolean(next)
      && canPackSkillInHalfRow(skill.title, 250, 10)
      && canPackSkillInHalfRow(next.title, 250, 10);
  });
}

function SortableModuleNode({
  module,
  depth,
  onToggle,
  onRename,
  onAddChild,
  onImportBullets,
  onDelete,
  onToggleLock,
  onTogglePriority,
  onSetTrimPoint,
  onMoveParent,
  onMoveSibling,
  onToggleCompactSkills,
  moduleAttention,
  sectionLayouts,
  onSectionLayoutChange,
  locale,
}: {
  module: ResumeModule;
  depth: number;
  onToggle: (module: ResumeModule) => void;
  onRename: (module: ResumeModule, value: string, field?: 'title' | 'subtitle') => void;
  onAddChild: (parent: ResumeModule, kind: 'entry' | 'bullet' | 'skill') => void;
  onImportBullets: (parent: ResumeModule) => void;
  onDelete: (module: ResumeModule) => void;
  onToggleLock: (module: ResumeModule) => void;
  onTogglePriority: (module: ResumeModule) => void;
  onSetTrimPoint: (module: ResumeModule) => void;
  onMoveParent: (module: ResumeModule) => void;
  onMoveSibling: (module: ResumeModule, direction: -1 | 1) => void;
  onToggleCompactSkills: (module: ResumeModule) => void;
  moduleAttention: Record<string, ModuleAttention>;
  sectionLayouts: Record<string, SectionLayoutMode>;
  onSectionLayoutChange: (sectionId: string, layout: SectionLayoutMode) => void;
  locale: UiLocale;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [subtitleEditing, setSubtitleEditing] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const attention = moduleAttention[module.id];
  const [showAttention, setShowAttention] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.id,
    disabled: Boolean(module.locked),
  });

  const currentEditValue =
    module.kind === 'bullet' ? (module.content ?? module.title) : module.title;
  const [draft, setDraft] = useState(currentEditValue);
  const [subtitleDraft, setSubtitleDraft] = useState(module.subtitle ?? '');
  const hasChildren = Boolean(module.children?.length);
  const canAddChildren = module.kind === 'section' || module.kind === 'entry';

  const beginEdit = () => {
    if (module.locked) return;
    setDraft(module.kind === 'bullet' ? (module.content ?? module.title) : module.title);
    setEditing(true);
  };

  const saveEdit = () => {
    const value = draft.trim();
    if (!value) {
      setDraft(currentEditValue);
      setEditing(false);
      return;
    }
    onRename(module, value, 'title');
    setEditing(false);
  };

  const beginSubtitleEdit = () => {
    if (module.locked) return;
    setSubtitleDraft(module.subtitle ?? '');
    setSubtitleEditing(true);
  };

  const saveSubtitleEdit = () => {
    onRename(module, subtitleDraft.trim(), 'subtitle');
    setSubtitleEditing(false);
  };

  const handleSubtitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveSubtitleEdit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setSubtitleDraft(module.subtitle ?? '');
      setSubtitleEditing(false);
    }
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveEdit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(currentEditValue);
      setEditing(false);
    }
  };

  return (
    <div ref={setNodeRef} className={`${styles.moduleNode} ${isDragging ? styles.draggingNode : ''}`}>
      <div
        className={`${styles.moduleRow} ${attention?.skillRecommendation === 'strong' ? styles.skillStrongRow : attention?.skillRecommendation === 'related' ? styles.skillRelatedRow : ''}`}
        style={{
          paddingLeft: 12 + depth * 20,
          transform: DndCSS.Transform.toString(transform),
          transition,
        }}
      >
        <button
          type="button"
          className={styles.disclosure}
          onClick={() => hasChildren && setOpen((value) => !value)}
          aria-label={locale === 'zh' ? (open ? '收起模块' : '展开模块') : (open ? 'Collapse module' : 'Expand module')}
          disabled={!hasChildren}
        >
          {hasChildren ? (open ? '⌄' : '›') : '·'}
        </button>

        <input
          type="checkbox"
          checked={module.selected}
          onChange={() => onToggle(module)}
          disabled={Boolean(module.locked)}
          title={locale === 'zh' ? (module.locked ? '固定模块保持当前选择' : '选择/取消选择') : (module.locked ? 'Locked module keeps its current selection' : 'Select / deselect')}
          aria-label={locale === 'zh' ? (module.locked ? `已固定 ${module.title}` : `选择 ${module.title}`) : (module.locked ? `Locked ${module.title}` : `Select ${module.title}`)}
        />

        <button
          type="button"
          className={styles.dragHandleButton}
          title={locale === 'zh' ? (module.locked ? '固定模块不参与排序' : '拖拽排序') : (module.locked ? 'Locked modules are not reordered' : 'Drag to reorder')}
          aria-label={locale === 'zh' ? `拖拽 ${module.title}` : `Drag ${module.title}`}
          disabled={Boolean(module.locked)}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>

        <div className={styles.moduleText}>
          {editing ? (
            <span className={styles.editingLabel}>{locale === 'zh' ? '正在编辑完整文字…' : 'Editing full text…'}</span>
          ) : (
            <>
              <div className={styles.moduleTitleLine}>
                <button type="button" className={styles.moduleTitleButton} onClick={beginEdit} disabled={Boolean(module.locked)} title={locale === 'zh' ? (module.locked ? '固定模块内容不变' : '点击修改') : (module.locked ? 'Locked module content cannot be changed' : 'Click to edit')}>
                  {module.kind === 'bullet' ? (module.content ?? module.title) : module.title}
                </button>
                {module.locked && <span className={styles.fixedTextBadge}>{locale === 'zh' ? '固定' : 'Fixed'}</span>}
                {module.kind !== 'skill' && (attention?.strongestEvidence === 'direct' || attention?.strongestEvidence === 'strong') && <span className={styles.skillRecommendBadge}>{locale === 'zh' ? '推荐' : 'Recommended'}</span>}
                {module.kind !== 'skill' && (attention?.strongestEvidence === 'supporting' || attention?.strongestEvidence === 'weak') && <span className={styles.skillRelatedBadge}>{locale === 'zh' ? '相关' : 'Related'}</span>}
                {attention?.skillRecommendation === 'strong' && <span className={styles.skillRecommendBadge}>{locale === 'zh' ? '推荐' : 'Recommended'}</span>}
                {attention?.skillRecommendation === 'related' && <span className={styles.skillRelatedBadge}>{locale === 'zh' ? '相关' : 'Related'}</span>}
                {attention && attention.severity !== 'none' && (
                  <span className={styles.attentionWrap}>
                    <button
                      type="button"
                      className={`${styles.attentionBadge} ${attention.severity === 'missing' ? styles.attentionMissing : styles.attentionWarning}`}
                      onClick={() => setShowAttention((value) => !value)}
                      title={attention.title}
                      aria-label={locale === 'zh' ? `查看 ${module.title} 的提示` : `View note for ${module.title}`}
                    >
                      {attention.severity === 'missing' ? '!' : '•'}
                    </button>
                    {showAttention && (
                      <span className={styles.attentionPopover} role="status">
                        <strong>{attention.title}</strong>
                        {attention.details.map((detail) => <small key={detail}>{detail}</small>)}
                      </span>
                    )}
                  </span>
                )}
              </div>
              {module.kind === 'entry' && (
                subtitleEditing ? (
                  <input
                    className={`${styles.inlineEditor} ${styles.subtitleEditor}`}
                    value={subtitleDraft}
                    onChange={(event) => setSubtitleDraft(event.target.value)}
                    onKeyDown={handleSubtitleKeyDown}
                    onBlur={saveSubtitleEdit}
                    autoFocus
                    placeholder={locale === 'zh' ? '副标题，例如公司 · 地点 / 学位 · 专业' : 'Subtitle, e.g. Company · Location / Degree · Major'}
                    aria-label={locale === 'zh' ? `修改 ${module.title} 的副标题` : `Edit subtitle for ${module.title}`}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.moduleSubtitleButton}
                    onClick={beginSubtitleEdit}
                    title={locale === 'zh' ? (module.locked ? '固定模块内容不变' : '点击修改副标题') : (module.locked ? 'Locked module content cannot be changed' : 'Click to edit subtitle')}
                    disabled={Boolean(module.locked)}
                  >
                    {module.subtitle?.trim() || (locale === 'zh' ? '＋ 添加副标题' : '＋ Add subtitle')}
                  </button>
                )
              )}
              {module.kind !== 'entry' && module.subtitle && module.kind !== 'bullet' && (
                <span className={styles.moduleSubtitle}>{module.subtitle}</span>
              )}
            </>
          )}
        </div>

        {module.kind === 'section' && (
          <SectionLayoutSelector
            value={sectionLayouts[module.id] ?? 'list'}
            onChange={(layout) => onSectionLayoutChange(module.id, layout)}
            locale={locale}
          />
        )}

        <div className={styles.rowActions}>
          <button
            type="button"
            className={`${styles.rowActionButton} ${module.targetingPriority ? styles.priorityActiveButton : ''}`}
            onClick={() => onTogglePriority(module)}
            title={locale === 'zh' ? (module.targetingPriority ? '取消优先匹配' : '优先匹配：JD 匹配和页面竞争中给予软优先级，不等于固定保留') : (module.targetingPriority ? 'Remove targeting priority' : 'Soft priority in JD matching and page competition; not a fixed lock')}
            aria-label={locale === 'zh' ? (module.targetingPriority ? `取消优先匹配 ${module.title}` : `优先匹配 ${module.title}`) : (module.targetingPriority ? `Remove targeting priority for ${module.title}` : `Prioritize ${module.title}`)}
          >{module.targetingPriority ? '★' : '☆'}</button>
          {module.kind === 'bullet' && (
            <button
              type="button"
              className={`${styles.rowActionButton} ${module.compactContent ? styles.priorityActiveButton : ''}`}
              onClick={() => onSetTrimPoint(module)}
              disabled={Boolean(module.locked)}
              title={module.compactContent ? '编辑/移除内部断点（Compact 版本）' : '设置内部断点：允许页面紧张时使用你确认的短版本'}
              aria-label={`${module.compactContent ? '编辑' : '设置'} ${module.title} 的 Compact 断点`}
            >{locale === 'zh' ? '断' : 'Cut'}</button>
          )}
          {hasCompactShortSkillCandidates(module) && (
            <label className={styles.compactSkillControl} title={locale === 'zh' ? '仅重新排列短技能；不修改、不缩写文字' : 'Reorder short skills only; do not edit or abbreviate text'}>
              <input
                type="checkbox"
                checked={Boolean(module.compactShortSkills)}
                onChange={() => onToggleCompactSkills(module)}
                disabled={Boolean(module.locked)}
              />
              <span>{locale === 'zh' ? '紧凑短词' : 'Compact short items'}</span>
            </label>
          )}
          {module.kind !== 'section' && (
            <>
              <button type="button" className={styles.rowActionButton} onClick={() => onMoveSibling(module, -1)} disabled={Boolean(module.locked)} title={locale === 'zh' ? '上移' : 'Move up'} aria-label={locale === 'zh' ? `上移 ${module.title}` : `Move ${module.title} up`}>↑</button>
              <button type="button" className={styles.rowActionButton} onClick={() => onMoveSibling(module, 1)} disabled={Boolean(module.locked)} title={locale === 'zh' ? '下移' : 'Move down'} aria-label={locale === 'zh' ? `下移 ${module.title}` : `Move ${module.title} down`}>↓</button>
            </>
          )}
          {(module.kind === 'entry' || module.kind === 'bullet') && (
            <button
              type="button"
              className={styles.rowActionButton}
              onClick={() => onMoveParent(module)}
              disabled={Boolean(module.locked)}
              title={module.kind === 'bullet' ? '转换为条目（Entry）' : '转换为 Bullet'}
              aria-label={module.kind === 'bullet' ? `将 Bullet ${module.title} 转换为条目` : `将条目 ${module.title} 转换为 Bullet`}
            >↔</button>
          )}
          <button
            type="button"
            className={`${styles.rowActionButton} ${module.locked ? styles.lockActiveButton : ''}`}
            onClick={() => onToggleLock(module)}
            title={module.locked ? '取消固定：允许人工编辑和 Targeting（仅适用区域）' : '固定：保持选择、顺序和内容不变'}
            aria-label={module.locked ? `取消固定 ${module.title}` : `固定 ${module.title}`}
          >{module.locked ? '🔒' : '◇'}</button>
          <button type="button" className={styles.rowActionButton} onClick={beginEdit} title={module.locked ? '固定模块不能修改' : '修改'} aria-label={`修改 ${module.title}`} disabled={Boolean(module.locked)}>✎</button>
          {canAddChildren && (
            <button
              type="button"
              className={styles.rowActionButton}
              onClick={() => setShowAddMenu((value) => !value)}
              title={module.locked ? '固定模块不能添加子模块' : '添加子模块'}
              disabled={Boolean(module.locked)}
              aria-label={`为 ${module.title} 添加子模块`}
            >
              ＋
            </button>
          )}
          <button
            type="button"
            className={`${styles.rowActionButton} ${styles.deleteButton}`}
            onClick={() => onDelete(module)}
            disabled={Boolean(module.locked)}
            title={module.locked ? '锁定模块不能删除' : '删除模块'}
            aria-label={`删除 ${module.title}`}
          >
            ×
          </button>
        </div>
      </div>

      {editing && (
        <div className={styles.expandedEditorWrap} style={{ marginLeft: 74 + depth * 20 }}>
          <textarea
            className={styles.expandedEditor}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleEditorKeyDown}
            autoFocus
            rows={4}
            aria-label={locale === 'zh' ? `编辑 ${module.title} 的完整文字` : `Edit full text for ${module.title}`}
          />
          <div className={styles.expandedEditorActions}>
            <span>{draft.length} {locale === 'zh' ? '字符' : 'characters'}</span>
            <button type="button" onClick={() => { setDraft(currentEditValue); setEditing(false); }}>{locale === 'zh' ? '取消' : 'Cancel'}</button>
            <button type="button" onClick={saveEdit}>{locale === 'zh' ? '保存' : 'Save'}</button>
          </div>
        </div>
      )}

      {showAddMenu && (
        <div className={styles.inlineAddMenu} style={{ marginLeft: 74 + depth * 20 }}>
          {module.kind === 'section' && (
            <>
              <button type="button" onClick={() => { onAddChild(module, 'entry'); setShowAddMenu(false); setOpen(true); }}>＋ {locale === 'zh' ? '条目' : 'Entry'}</button>
              <button type="button" onClick={() => { onAddChild(module, 'skill'); setShowAddMenu(false); setOpen(true); }}>＋ {locale === 'zh' ? '技能' : 'Skill'}</button>
            </>
          )}
          {module.kind === 'entry' && (
            <>
              <button type="button" onClick={() => { onAddChild(module, 'bullet'); setShowAddMenu(false); setOpen(true); }}>＋ Bullet</button>
              <button type="button" onClick={() => { onImportBullets(module); setShowAddMenu(false); setOpen(true); }}>⇧ {locale === 'zh' ? '导入 Bullet' : 'Import Bullet'}</button>
            </>
          )}
        </div>
      )}

      {open && module.children && module.children.length > 0 && (
        <SortableModuleList
          modules={module.children}
          depth={depth + 1}
          onToggle={onToggle}
          onRename={onRename}
          onAddChild={onAddChild}
          onImportBullets={onImportBullets}
          onDelete={onDelete}
          onToggleLock={onToggleLock}
          onTogglePriority={onTogglePriority}
          onSetTrimPoint={onSetTrimPoint}
          onMoveParent={onMoveParent}
          onMoveSibling={onMoveSibling}
          onToggleCompactSkills={onToggleCompactSkills}
          moduleAttention={moduleAttention}
          sectionLayouts={sectionLayouts}
          onSectionLayoutChange={onSectionLayoutChange}
          locale={locale}
        />
      )}
    </div>
  );
}

function SortableModuleList({
  modules,
  depth,
  onToggle,
  onRename,
  onAddChild,
  onImportBullets,
  onDelete,
  onToggleLock,
  onTogglePriority,
  onSetTrimPoint,
  onMoveParent,
  onMoveSibling,
  onToggleCompactSkills,
  moduleAttention,
  sectionLayouts,
  onSectionLayoutChange,
  locale,
}: {
  modules: ResumeModule[];
  depth: number;
  onToggle: (module: ResumeModule) => void;
  onRename: (module: ResumeModule, value: string, field?: 'title' | 'subtitle') => void;
  onAddChild: (parent: ResumeModule, kind: 'entry' | 'bullet' | 'skill') => void;
  onImportBullets: (parent: ResumeModule) => void;
  onDelete: (module: ResumeModule) => void;
  onToggleLock: (module: ResumeModule) => void;
  onTogglePriority: (module: ResumeModule) => void;
  onSetTrimPoint: (module: ResumeModule) => void;
  onMoveParent: (module: ResumeModule) => void;
  onMoveSibling: (module: ResumeModule, direction: -1 | 1) => void;
  onToggleCompactSkills: (module: ResumeModule) => void;
  moduleAttention: Record<string, ModuleAttention>;
  sectionLayouts: Record<string, SectionLayoutMode>;
  onSectionLayoutChange: (sectionId: string, layout: SectionLayoutMode) => void;
  locale: UiLocale;
}) {
  return (
    <SortableContext items={modules.map((module) => module.id)} strategy={verticalListSortingStrategy}>
      {modules.map((module) => (
        <SortableModuleNode
          key={module.id}
          module={module}
          depth={depth}
          onToggle={onToggle}
          onRename={onRename}
          onAddChild={onAddChild}
          onImportBullets={onImportBullets}
          onDelete={onDelete}
          onToggleLock={onToggleLock}
          onTogglePriority={onTogglePriority}
          onSetTrimPoint={onSetTrimPoint}
          onMoveParent={onMoveParent}
          onMoveSibling={onMoveSibling}
          onToggleCompactSkills={onToggleCompactSkills}
          moduleAttention={moduleAttention}
          sectionLayouts={sectionLayouts}
          onSectionLayoutChange={onSectionLayoutChange}
          locale={locale}
        />
      ))}
    </SortableContext>
  );
}

type ResumeSectionFragment = {
  sectionId: string;
  childIds: string[];
  continuation?: boolean;
};

type ResumePageModel = ResumeSectionFragment[];

function isMarkdownSeparator(value: string) {
  return /^(?:-{3,}|\*{3,}|_{3,})$/.test(value.trim().replace(/\s+/g, ''));
}

function moduleRenderedText(module: ResumeModule) {
  const value = module.useCompactContent && module.compactContent?.trim()
    ? module.compactContent.trim()
    : (module.content ?? module.title);
  return isMarkdownSeparator(value) ? '' : value;
}

function moduleHasRenderableContent(module: ResumeModule): boolean {
  if (!module.selected) return false;
  if (module.kind === 'bullet') return Boolean(moduleRenderedText(module).trim());
  if (module.kind === 'skill') return Boolean(module.title.trim());

  // If an entry/section owns children, renderability must come from at least one
  // selected renderable child. This prevents a Work/Project heading from leaking
  // into the PDF after all of its bullets were deselected by Targeting.
  if ((module.children?.length ?? 0) > 0) {
    return module.children!.some((child) => child.selected && moduleHasRenderableContent(child));
  }

  // True leaf entries (for example Education records with no bullet children)
  // remain valid because their factual payload lives in title/subtitle/content.
  if (module.kind === 'entry') return Boolean(module.title.trim() || module.subtitle?.trim() || module.content?.trim());
  return Boolean((module.content ?? '').trim());
}

function rowFirstPreviewLayout(items: ResumeModule[]) {
  const pairedCount = items.length - (items.length % 2);
  const pairs: Array<[ResumeModule, ResumeModule]> = [];
  for (let index = 0; index < pairedCount; index += 2) {
    pairs.push([items[index], items[index + 1]]);
  }
  return { pairs, odd: items.length % 2 ? items[items.length - 1] : null };
}

function ResumeSectionView({
  section,
  layout,
  childIds,
  continuation = false,
}: {
  section: ResumeModule;
  layout: SectionLayoutMode;
  childIds?: string[];
  continuation?: boolean;
}) {
  const selectedChildren = (section.children ?? []).filter(
    (child) =>
      child.selected &&
      moduleHasRenderableContent(child) &&
      (!childIds || childIds.includes(child.id)),
  );

  if (!selectedChildren.length) return null;

  const renderChild = (child: ResumeModule) => {
    if (child.kind === 'skill') {
      return <span key={child.id} className={styles.previewSkill} data-child-id={child.id}>{child.title}</span>;
    }
    if (child.kind === 'bullet') {
      const text = moduleRenderedText(child);
      return text ? <p key={child.id} className={styles.previewLooseBullet} data-child-id={child.id}>{text}</p> : null;
    }
    return (
      <div key={child.id} className={styles.previewEntry} data-child-id={child.id}>
        {(() => { const aligned = parseAlignedResumeLine(child.title); return aligned ? <div className={styles.previewAlignedRow}><strong>{aligned.left}</strong><strong>{aligned.right}</strong></div> : <strong>{child.title}</strong>; })()}
        {child.subtitle && (() => { const aligned = parseAlignedResumeLine(child.subtitle); return aligned ? <div className={styles.previewAlignedRow}><span>{aligned.left}</span><span>{aligned.right}</span></div> : <span>{child.subtitle}</span>; })()}
        {child.compactShortSkills ? (
          <div className={styles.previewCompactSkillRows}>
            {(() => {
              const items = (child.children ?? []).filter((item) => item.selected && moduleHasRenderableContent(item));
              const rows: ResumeModule[][] = [];
              const sectionColumns = layout === 'grid-3x3' ? 3 : (layout === 'row-first-2col' || layout === 'grid-2x2' || layout === 'grid-2x3' ? 2 : 1);
              const availableEntryWidthPt = (595.28 - 80) / sectionColumns;
              for (let index = 0; index < items.length; index += 1) {
                const current = items[index];
                const next = items[index + 1];
                const canPair = current.kind === 'skill'
                  && next?.kind === 'skill'
                  && canPackSkillInHalfRow(moduleRenderedText(current), availableEntryWidthPt, 10)
                  && canPackSkillInHalfRow(moduleRenderedText(next), availableEntryWidthPt, 10);
                if (canPair && next) {
                  rows.push([current, next]);
                  index += 1;
                } else {
                  rows.push([current]);
                }
              }
              return rows.map((row, rowIndex) => (
                <div key={`${child.id}-compact-row-${rowIndex}`} className={row.length === 2 ? styles.previewCompactSkillPairRow : styles.previewCompactSkillFullRow}>
                  {row.map((item) => <div key={item.id} className={styles.previewCompactSkillCell}>• {moduleRenderedText(item)}</div>)}
                </div>
              ));
            })()}
          </div>
        ) : (
          <ul>{child.children?.filter((item) => item.selected && moduleHasRenderableContent(item)).map((item) => <li key={item.id}>{moduleRenderedText(item)}</li>)}</ul>
        )}
      </div>
    );
  };

  if (layout === 'row-first-2col') {
    const rowFirst = rowFirstPreviewLayout(selectedChildren);
    return (
      <section className={styles.resumeSection} data-section-id={section.id}>
        <h2>{section.title}{continuation && <span className={styles.continuationLabel}>续</span>}</h2>
        <div className={styles.previewRowFirstSkills}>
          {rowFirst.pairs.map(([left, right], index) => (
            <div key={index} className={styles.previewSkillPair}>
              <div>{renderChild(left)}</div>
              <div>{renderChild(right)}</div>
            </div>
          ))}
          {rowFirst.odd && <div className={styles.previewSkillOdd}>{renderChild(rowFirst.odd)}</div>}
        </div>
      </section>
    );
  }

  return (
    <section
      className={styles.resumeSection}
      data-section-id={section.id}
    >
      <h2>
        {section.title}
        {continuation && (
          <span className={styles.continuationLabel}>续</span>
        )}
      </h2>

      <div className={styles.previewSectionContent} data-layout={layout}>
        {selectedChildren.map(renderChild)}

      </div>
    </section>
  );
}

function ResumePageContent({
  resume,
  sectionLayouts,
  fragments,
  showHeader,
}: {
  resume: ResumeDocument;
  sectionLayouts: Record<string, SectionLayoutMode>;
  fragments: ResumePageModel;
  showHeader: boolean;
}) {
  return (
    <>
      {showHeader && (
        <header className={styles.resumeHeader}>
          <h1>{resume.name}</h1>
          <p>{resume.contactLine}</p>
        </header>
      )}

      {fragments.map((fragment, fragmentIndex) => {
        const section = resume.sections.find(
          (candidate) =>
            candidate.selected && moduleHasRenderableContent(candidate) && candidate.id === fragment.sectionId,
        );
        if (!section) return null;

        return (
          <ResumeSectionView
            key={`${fragment.sectionId}:${fragmentIndex}`}
            section={section}
            layout={sectionLayouts[section.id] ?? 'list'}
            childIds={fragment.childIds}
            continuation={fragment.continuation}
          />
        );
      })}
    </>
  );
}

function PaginatedResumePreview({
  resume,
  paperStyle,
  sectionLayouts,
  pageIndex,
  paperSize,
  onMetrics,
}: {
  resume: ResumeDocument;
  paperStyle: CSSProperties;
  sectionLayouts: Record<string, SectionLayoutMode>;
  pageIndex: number;
  paperSize: 'a4' | 'letter';
  onMetrics: (metrics: {
    pageCount: number;
    usagePercent: number;
    maxUsagePercent: number;
    usageByPage: number[];
    pages: ResumePageModel[];
  }) => void;
}) {
  const measureRef = useRef<HTMLElement>(null);
  const [pages, setPages] = useState<ResumePageModel[]>([[]]);
  const [usageByPage, setUsageByPage] = useState<number[]>([0]);

  useEffect(() => {
    const measurePage = measureRef.current;
    if (!measurePage) return;

    const outerHeight = (node: HTMLElement | null) => {
      if (!node) return 0;
      const nodeStyle = window.getComputedStyle(node);
      return (
        node.offsetHeight +
        (Number.parseFloat(nodeStyle.marginTop) || 0) +
        (Number.parseFloat(nodeStyle.marginBottom) || 0)
      );
    };

    const measure = () => {
      const selectedSections = resume.sections.filter(
        (section) => section.selected,
      );

      const computed = window.getComputedStyle(measurePage);
      const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
      const usableHeight = Math.max(
        1,
        measurePage.clientHeight - paddingTop - paddingBottom,
      );

      const headerHeight = outerHeight(
        measurePage.querySelector<HTMLElement>('[data-measure-role="header"]'),
      );

      const nextPages: ResumePageModel[] = [];
      const usedHeights: number[] = [];

      let currentPage: ResumePageModel = [];
      let currentHeight = headerHeight;

      const flushPage = () => {
        nextPages.push(currentPage);
        usedHeights.push(currentHeight);
        currentPage = [];
        currentHeight = 0;
      };

      for (const section of selectedSections) {
        const sectionNode = Array.from(
          measurePage.querySelectorAll<HTMLElement>('[data-section-id]'),
        ).find((node) => node.dataset.sectionId === section.id);

        if (!sectionNode) continue;

        const sectionHeight = outerHeight(sectionNode);
        const headingHeight = outerHeight(
          sectionNode.querySelector<HTMLElement>('h2'),
        );
        const selectedChildren = (section.children ?? []).filter(
          (child) => child.selected,
        );
        const selectedChildIds = selectedChildren.map((child) => child.id);

        // Empty sections are still valid visible modules.
        if (selectedChildren.length === 0) {
          if (
            currentPage.length > 0 &&
            currentHeight + sectionHeight > usableHeight
          ) {
            flushPage();
          }

          currentPage.push({
            sectionId: section.id,
            childIds: [],
          });
          currentHeight += sectionHeight;
          continue;
        }

        // If the whole section fits on one physical page, preserve it as an
        // atomic section and move it to the next page when necessary.
        if (sectionHeight <= usableHeight) {
          if (
            currentPage.length > 0 &&
            currentHeight + sectionHeight > usableHeight
          ) {
            flushPage();
          }

          currentPage.push({
            sectionId: section.id,
            childIds: selectedChildIds,
          });
          currentHeight += sectionHeight;
          continue;
        }

        // Oversized section: split only at direct child boundaries.
        // The section title is repeated on continuation pages.
        let childIndex = 0;
        let continuation = false;

        while (childIndex < selectedChildren.length) {
          const firstChild = selectedChildren[childIndex];
          const firstChildNode = Array.from(
            sectionNode.querySelectorAll<HTMLElement>('[data-child-id]'),
          ).find((node) => node.dataset.childId === firstChild.id) ?? null;
          const firstChildHeight = outerHeight(firstChildNode);

          if (
            currentPage.length > 0 &&
            currentHeight + headingHeight + firstChildHeight > usableHeight
          ) {
            flushPage();
          }

          const fragmentChildIds: string[] = [];
          let fragmentHeight = headingHeight;

          while (childIndex < selectedChildren.length) {
            const child = selectedChildren[childIndex];
            const childNode = Array.from(
              sectionNode.querySelectorAll<HTMLElement>('[data-child-id]'),
            ).find((node) => node.dataset.childId === child.id) ?? null;
            const childHeight = outerHeight(childNode);

            if (
              fragmentChildIds.length > 0 &&
              currentHeight + fragmentHeight + childHeight > usableHeight
            ) {
              break;
            }

            fragmentChildIds.push(child.id);
            fragmentHeight += childHeight;
            childIndex += 1;

            // An individual entry can theoretically be taller than a page.
            // Keep it visible and report >100% usage instead of silently
            // clipping the page-fit status.
            if (
              fragmentChildIds.length === 1 &&
              currentHeight + fragmentHeight > usableHeight
            ) {
              break;
            }
          }

          currentPage.push({
            sectionId: section.id,
            childIds: fragmentChildIds,
            continuation,
          });
          currentHeight += fragmentHeight;
          continuation = true;

          if (childIndex < selectedChildren.length) {
            flushPage();
          }
        }
      }

      if (currentPage.length > 0 || nextPages.length === 0) {
        flushPage();
      }

      const nextUsage = usedHeights.map((height) =>
        Math.max(0, Math.round((height / usableHeight) * 100)),
      );

      setPages(nextPages);
      setUsageByPage(nextUsage);

      const safePageIndex = Math.min(pageIndex, nextPages.length - 1);
      onMetrics({
        pageCount: nextPages.length,
        usagePercent: nextUsage[safePageIndex] ?? 0,
        maxUsagePercent: Math.max(0, ...nextUsage),
        usageByPage: nextUsage,
        pages: nextPages,
      });
    };

    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(measurePage);

    for (const node of Array.from(
      measurePage.querySelectorAll<HTMLElement>('[data-section-id]'),
    )) {
      observer.observe(node);
    }

    window.addEventListener('resize', measure);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [resume, paperStyle, sectionLayouts, pageIndex, onMetrics]);

  const safePageIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const fallbackPage: ResumePageModel = resume.sections
    .filter((section) => section.selected)
    .map((section) => ({
      sectionId: section.id,
      childIds: (section.children ?? [])
        .filter((child) => child.selected)
        .map((child) => child.id),
    }));

  const renderPages: ResumePageModel[] =
    pages.length > 0 && pages.some((page) => page.length > 0)
      ? pages
      : [fallbackPage];

  return (
    <>
      <article
        ref={measureRef}
        className={`${styles.paper} ${styles.physicalPage} ${styles.measurePaper}`}
        data-paper={paperSize}
        style={paperStyle}
        aria-hidden="true"
      >
        <header
          className={styles.resumeHeader}
          data-measure-role="header"
        >
          <h1>{resume.name}</h1>
          <p>{resume.contactLine}</p>
        </header>

        {resume.sections
          .filter((section) => section.selected && moduleHasRenderableContent(section))
          .map((section) => (
            <ResumeSectionView
              key={section.id}
              section={section}
              layout={sectionLayouts[section.id] ?? 'list'}
            />
          ))}
      </article>

      <div className={styles.previewPageStack}>
        {renderPages.map((fragments, renderedPageIndex) => (
          <div
            key={renderedPageIndex}
            className={`${styles.previewPageWrap} ${
              renderedPageIndex === safePageIndex ? styles.previewPageActive : ''
            }`}
            data-preview-page={renderedPageIndex + 1}
          >
            <article
              className={`${styles.paper} ${styles.physicalPage}`}
              data-paper={paperSize}
              style={paperStyle}
            >
              <ResumePageContent
                resume={resume}
                sectionLayouts={sectionLayouts}
                fragments={fragments}
                showHeader={renderedPageIndex === 0}
              />
            </article>
          </div>
        ))}
      </div>
    </>
  );
}

function TabletSwitcher({ value, onChange, locale }: { value: 'modules' | 'job'; onChange: (value: 'modules' | 'job') => void; locale: UiLocale }) {
  return (
    <div className={styles.tabletSwitcher}>
      <button type="button" className={`${styles.secondaryButton} ${value === 'modules' ? styles.tabletSwitcherActive : ''}`} onClick={() => onChange('modules')}>{locale === 'zh' ? '模块' : 'Modules'}</button>
      <button type="button" className={`${styles.secondaryButton} ${value === 'job' ? styles.tabletSwitcherActive : ''}`} onClick={() => onChange('job')}>{locale === 'zh' ? '职位描述' : 'Job Description'}</button>
    </div>
  );
}

type MailConnectionStatus = {
  connected: boolean;
  provider?: 'google';
  account?: string;
  displayName?: string;
  providers?: { google: boolean };
};

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export default function ModularResumeWorkbench() {
  const [resume, setResume] = useState<ResumeDocument>(mockResume);
  const [search, setSearch] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [pageLimit, setPageLimit] = useState<'1' | '2' | 'none'>('1');
  const [analysisReady, setAnalysisReady] = useState(false);
  const [targetingAnalysis, setTargetingAnalysis] = useState<TargetingAnalysis | null>(null);
  const [summaryVariant, setSummaryVariant] = useState<0 | 1 | 2>(0);
  const [targetingApplied, setTargetingApplied] = useState(false);
  // B4.6.2.3: recommendation is the stable product truth; auto page fill is an optional assist.
  const [autoPageFill, setAutoPageFill] = useState(true);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const convergenceGateRef = useRef<{ revisionKey: string; corrections: number }>({ revisionKey: '', corrections: 0 });
  // B4.6.2.2: freeze the un-targeted document used to create the semantic snapshot.
  // Re-applying Targeting must never use an already-pruned Application Resume as its new source.
  const masterResumeRef = useRef<ResumeDocument>(mockResume);
  const importModeRef = useRef<'replace' | 'append'>('replace');
  // One-shot root metadata guard for Replace Import. The importer already owns the
  // canonical identity; this prevents any stale/default same-cycle state write from
  // clearing contactLine while leaving the imported module tree intact.
  const pendingReplaceIdentityRef = useRef<{
    resumeId: string;
    name: string;
    candidateName: string;
    contactLine: string;
  } | null>(null);
  const applyRevisionRef = useRef('');
  const explicitResumeLoadRef = useRef(false);
  const finalSelectionSnapshotRef = useRef<{ revisionKey: string; resume: ResumeDocument } | null>(null);
  const [tabletPane, setTabletPane] = useState<'modules' | 'job'>('modules');
  const [mobilePane, setMobilePane] = useState<'preview' | 'modules' | 'job'>('modules');
  const importInputRef = useRef<HTMLInputElement>(null);
  const moduleImportInputRef = useRef<HTMLInputElement>(null);
  const templateImportInputRef = useRef<HTMLInputElement>(null);
  const jobScrollRef = useRef<HTMLDivElement>(null);
  const [importError, setImportError] = useState('');
  const [pdfIntegrity, setPdfIntegrity] = useState<PdfIntegrityReport | undefined>(undefined);
  const [atsChecking, setAtsChecking] = useState(false);
  const [templates, setTemplates] = useState<ResumeTemplate[]>([]);
  const [templateMessage, setTemplateMessage] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [roleName, setRoleName] = useState('');
  const [coverLetterLength, setCoverLetterLength] = useState<CoverLetterLength>('standard');
  const [coverLetterDraft, setCoverLetterDraft] = useState('');
  const [applicationNotes, setApplicationNotes] = useState('');
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailBodyDraft, setEmailBodyDraft] = useState('');
  const [emailBodyEdited, setEmailBodyEdited] = useState(false);
  const [includeResumeAttachment, setIncludeResumeAttachment] = useState(true);
  const [includeCoverLetterAttachment, setIncludeCoverLetterAttachment] = useState(false);
  const [mailConnection, setMailConnection] = useState<MailConnectionStatus>({ connected: false });
  const [mailConnectionLoading, setMailConnectionLoading] = useState(true);
  const [, setMailDraftState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [mailMessage, setMailMessage] = useState('');


  const scrollJobPanelTo = (sectionId: string) => {
    const container = jobScrollRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-job-section=\"${sectionId}\"]`);
    if (!target) return;
    const top = target.offsetTop - 54;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  const [fontFamily, setFontFamily] = useState<'Arial' | 'Georgia' | 'Times New Roman' | 'Helvetica'>('Arial');
  const [bodyFontSize, setBodyFontSize] = useState(10.5);
  const [density, setDensity] = useState<'compact' | 'standard' | 'relaxed'>('standard');
  const [paperSize, setPaperSize] = useState<'a4' | 'letter'>('a4');
  const [marginPreset, setMarginPreset] = useState<'compact' | 'standard' | 'wide'>('standard');
  const [activeTemplateId, setActiveTemplateId] = useState('ats-standard');

  const [exportFileName, setExportFileName] = useState('Resume');
  const [sectionLayouts, setSectionLayouts] = useState<Record<string, SectionLayoutMode>>({});
  const [defaultShortWordLayout, setDefaultShortWordLayout] = useState<SectionLayoutMode>('grid-2x2');
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  const [deletedPanelOpen, setDeletedPanelOpen] = useState(false);
  const [deletedModules, setDeletedModules] = useState<Array<DeletedModuleItem<ResumeModule>>>([]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewPageCount, setPreviewPageCount] = useState(1);
  const [previewUsagePercent, setPreviewUsagePercent] = useState(0);
  const [previewMaxUsagePercent, setPreviewMaxUsagePercent] = useState(0);
  const [previewUsageByPage, setPreviewUsageByPage] = useState<number[]>([0]);
  const [dndReady, setDndReady] = useState(false);
  const [uiLocale, setUiLocale] = useState<UiLocale>(() => {
    if (typeof window === 'undefined') return 'en';
    const stored = window.localStorage.getItem('modular-resume-ui-locale');
    return stored === 'zh' || stored === 'en' ? stored : 'en';
  });
  const ui = UI_MESSAGES[uiLocale];


  useEffect(() => {
    window.localStorage.setItem('modular-resume-ui-locale', uiLocale);
    document.documentElement.lang = uiLocale === 'zh' ? 'zh-CN' : 'en';
    document.title = uiLocale === 'zh' ? '模块化简历' : 'Modular Resume';
  }, [uiLocale]);

  const invalidateTargetingAfterSemanticEdit = () => {
    setAnalysisReady(false);
    setTargetingAnalysis(null);
    setTargetingApplied(false);
    setPdfIntegrity(undefined);
    convergenceGateRef.current = { revisionKey: '', corrections: 0 };
    applyRevisionRef.current = '';
    finalSelectionSnapshotRef.current = null;
  };

  const syncOwnerMetadataAcrossSnapshots = (next: ResumeDocument) => {
    masterResumeRef.current = {
      ...masterResumeRef.current,
      name: next.name,
      candidateName: next.candidateName,
      contactLine: next.contactLine,
    };
    const frozen = finalSelectionSnapshotRef.current;
    if (frozen) {
      frozen.resume = {
        ...frozen.resume,
        name: next.name,
        candidateName: next.candidateName,
        contactLine: next.contactLine,
      };
    }
  };

  useEffect(() => {
    let active = true;
    fetch('/api/mail/status', { cache: 'no-store' })
      .then((response) => response.json() as Promise<MailConnectionStatus>)
      .then((status) => { if (active) setMailConnection(status); })
      .catch(() => { if (active) setMailConnection({ connected: false }); })
      .finally(() => { if (active) setMailConnectionLoading(false); });

    const params = new URLSearchParams(window.location.search);
    if (params.get('settings') === 'mail') window.setTimeout(() => setPageSettingsOpen(true), 0);
    const mailError = params.get('mailError');
    if (mailError) {
      window.setTimeout(() => {
        if (!active) return;
        setMailDraftState('error');
        setMailMessage(mailError);
      }, 0);
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDndReady(true);
      setTemplates(loadTemplates());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const pending = pendingReplaceIdentityRef.current;
    if (!pending || resume.id !== pending.resumeId) return;

    const candidateName = resume.candidateName ?? resume.name;
    const identityMatches =
      resume.name === pending.name
      && candidateName === pending.candidateName
      && resume.contactLine === pending.contactLine;

    if (identityMatches) {
      pendingReplaceIdentityRef.current = null;
      return;
    }

    setResume((current) => {
      if (current.id !== pending.resumeId) return current;
      const restored: ResumeDocument = {
        ...current,
        name: pending.name,
        candidateName: pending.candidateName,
        contactLine: pending.contactLine,
      };
      // Keep the Master root metadata consistent with the live editor state without
      // touching its module selection/tree snapshot.
      if (masterResumeRef.current.id === pending.resumeId) {
        masterResumeRef.current = {
          ...masterResumeRef.current,
          name: pending.name,
          candidateName: pending.candidateName,
          contactLine: pending.contactLine,
        };
      }
      return restored;
    });
  }, [resume.id, resume.name, resume.candidateName, resume.contactLine]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const counts = useMemo(() => countModules(resume.sections), [resume.sections]);

  const selectedContentUnits = useMemo(
    () => countSelectedContentUnits(resume),
    [resume],
  );

  const targetingContentSlots = useMemo(
    () => estimateContentSlots({
      targetPages: pageLimit,
      selectedContentUnits,
      previewPageCount,
      previewMaxUsagePercent,
      resume,
      pageSettings: { paperSize, bodyFontSize, density, marginPreset },
    }),
    [pageLimit, selectedContentUnits, previewPageCount, previewMaxUsagePercent, resume, paperSize, bodyFontSize, density, marginPreset],
  );



  const runTargetingAnalysis = () => {
    if (!jobDescription.trim()) return;
    // The resume visible before analysis is the Master baseline for this targeting revision.
    masterResumeRef.current = JSON.parse(JSON.stringify(resume)) as ResumeDocument;
    const analysis = analyzeTargeting({
      jobDescription,
      resume,
      options: {
        settings: { targetPages: pageLimit, paperSize, bodyFontSize, density, marginPreset },
        estimatedContentSlots: targetingContentSlots,
        summaryVariant: 0,
      },
    });
    setTargetingAnalysis(analysis);
    setSummaryVariant(0);
    setAnalysisReady(true);
    setTargetingApplied(false);
    convergenceGateRef.current = { revisionKey: '', corrections: 0 };
    applyRevisionRef.current = '';
    finalSelectionSnapshotRef.current = null;
  };

  const handleRecomposeSummaryV2 = () => {
    if (!jobDescription.trim()) return;
    const nextVariant = ((summaryVariant + 1) % 3) as 0 | 1 | 2;
    const analysis = analyzeTargeting({
      jobDescription,
      resume,
      options: {
        settings: { targetPages: pageLimit, paperSize, bodyFontSize, density, marginPreset },
        estimatedContentSlots: targetingContentSlots,
        summaryVariant: nextVariant,
      },
    });
    setSummaryVariant(nextVariant);
    setTargetingAnalysis(analysis);
    setAnalysisReady(true);
  };

  const targetingLayoutPlan = useMemo(
    () => buildResumeLayoutPlan(resume, targetingAnalysis?.recommendations ?? []),
    [resume, targetingAnalysis],
  );

  const renderResume = useMemo(
    () => buildRenderResume(resume, targetingLayoutPlan, sectionLayouts, targetingAnalysis?.recommendations ?? []),
    [resume, targetingLayoutPlan, sectionLayouts, targetingAnalysis],
  );

  const keywordMatches = targetingAnalysis?.requirements.map((item) => ({
    keyword: item.label,
    matched: item.matched,
    coverage: item.coverage,
    priority: item.priority,
    frequency: item.frequency,
    score: item.weight,
  })) ?? [];
  const matchedKeywordCount = keywordMatches.filter((item) => item.matched).length;
  const topRecommendations = targetingAnalysis?.recommendations.filter((item) => item.disposition === 'auto-select' && !item.locked).slice(0, 16) ?? [];
  const similarContentGroups = useMemo(() => {
    if (!targetingAnalysis) return [] as Array<{ requirement: string; items: ModuleRecommendation[] }>;
    const candidates = targetingAnalysis.recommendations.filter((item) =>
      !item.locked &&
      (item.kind === 'bullet' || item.kind === 'entry') &&
      item.matchedRequirements.length > 0 &&
      item.disposition === 'auto-select',
    );
    const buckets = new Map<string, typeof candidates>();
    for (const item of candidates) {
      for (const requirement of item.matchedRequirements) {
        const bucket = buckets.get(requirement) ?? [];
        bucket.push(item);
        buckets.set(requirement, bucket);
      }
    }
    return [...buckets.entries()]
      .map(([requirement, items]) => ({
        requirement,
        items: [...new Map(items.map((item) => [item.moduleId, item])).values()]
          .sort((a, b) => b.score - a.score || b.evidenceValue - a.evidenceValue)
          .slice(0, 4),
      }))
      .filter((group) => group.items.length >= 2)
      .sort((a, b) => (b.items[0]?.score ?? 0) - (a.items[0]?.score ?? 0))
      .slice(0, 6);
  }, [targetingAnalysis]);
  const missingJdEvidence = targetingAnalysis?.missingRequirements.slice(0, 8) ?? [];
  const partialJdEvidence = targetingAnalysis?.partialRequirements.slice(0, 8) ?? [];
  const layoutPressureDiagnosis = useMemo(
    () => targetingAnalysis ? diagnoseLayoutPressure({
      resume,
      recommendations: targetingAnalysis.recommendations,
      targetPages: pageLimit,
      actualPages: previewPageCount,
      usageByPage: previewUsageByPage,
    }) : null,
    [targetingAnalysis, resume, pageLimit, previewPageCount, previewUsageByPage],
  );
  const inferredEmail = useMemo(() => inferJdApplicationEmail(jobDescription), [jobDescription]);


  const coverLetterPlan = targetingAnalysis ? buildCoverLetterPlan(resume, targetingAnalysis, companyName, roleName, { length: coverLetterLength }) : null;
  const applicationSummary = targetingAnalysis ? buildApplicationSummary(resume, targetingAnalysis, companyName, roleName, pageLimit) : null;
  const miniCoverNote = targetingAnalysis ? buildMiniCoverNote(resume, targetingAnalysis, companyName, roleName) : '';
  const contact = useMemo(() => parseContactLine(resume.contactLine || ''), [resume.contactLine]);
  const generatedEmailDraftPlan = targetingAnalysis ? buildApplicationEmailDraft({
    to: emailRecipient,
    cc: emailCc.split(/[;,\n]+/).map((item) => item.trim()).filter(Boolean),
    companyName,
    roleName,
    candidateName: resume.candidateName || resume.name,
    candidateEmail: contact.email,
    candidatePhone: contact.phone,
    miniCoverNote,
    attachments: { resume: includeResumeAttachment, coverLetter: includeCoverLetterAttachment, additionalFiles: [] },
  }) : null;
  const emailDraftPlan = generatedEmailDraftPlan ? { ...generatedEmailDraftPlan, body: emailBodyEdited ? emailBodyDraft : generatedEmailDraftPlan.body } : null;
  const closureChecks = targetingAnalysis ? detectApplicationLogicClosure({
    resume,
    analysis: targetingAnalysis,
    coverLetter: coverLetterDraft,
    email: emailDraftPlan,
    requireCoverLetter: includeCoverLetterAttachment,
    requireEmail: Boolean(emailRecipient.trim()),
    mailConnected: mailConnection.connected,
  }) : [];


  const handleGenerateCoverLetter = () => {
    if (!coverLetterPlan) return;
    setCoverLetterDraft(coverLetterPlan.draft);
  };

  const handleResetEmailBody = () => {
    if (!generatedEmailDraftPlan) return;
    setEmailBodyDraft(generatedEmailDraftPlan.body);
    setEmailBodyEdited(false);
  };

  const handleOpenEmailClient = () => {
    if (!emailDraftPlan) return;
    const query = new URLSearchParams({
      subject: emailDraftPlan.subject,
      body: emailDraftPlan.body,
      ...(emailDraftPlan.cc.length ? { cc: emailDraftPlan.cc.join(',') } : {}),
    }).toString();
    window.open(`mailto:${encodeURIComponent(emailDraftPlan.to)}?${query}`, '_self');
  };


  const handleDisconnectMail = async () => {
    await fetch('/api/mail/disconnect', { method: 'POST' });
    setMailConnection({ connected: false });
    setMailDraftState('idle');
    setMailMessage('');
  };



  const handleDownloadApplicationRecord = () => {
    if (!targetingAnalysis || !applicationSummary) return;
    const record: ApplicationPackageRecord = {
      version: 2,
      companyName: companyName.trim(),
      roleName: roleName.trim(),
      createdAt: new Date().toISOString(),
      jobDescription,
      resumeId: resume.id,
      candidateName: resume.candidateName || resume.name,
      targetPages: pageLimit,
      summary: applicationSummary,
      coverLetter: coverLetterDraft,
      email: emailDraftPlan ?? undefined,
      attachments: emailDraftPlan?.attachments,
      closureChecks,
      notes: applicationNotes,
      evidencePolicy: 'resume-only-no-fabrication',
    };
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeCompany = (companyName || 'Application').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
    const safeRole = roleName.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
    anchor.href = url;
    anchor.download = `${safeCompany}${safeRole ? `_${safeRole}` : ''}_Application.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };


  const handlePreviewMetrics = (metrics: {
    pageCount: number;
    usagePercent: number;
    maxUsagePercent: number;
    usageByPage: number[];
    pages: ResumePageModel[];
  }) => {
    setPreviewPageCount(metrics.pageCount);
    setPreviewUsagePercent(metrics.usagePercent);
    setPreviewMaxUsagePercent(metrics.maxUsagePercent);
    setPreviewUsageByPage(metrics.usageByPage);
    setPreviewPageIndex((current) =>
      Math.min(current, Math.max(0, metrics.pageCount - 1)),
    );
  };

  const pageSettings: PageSettings = useMemo(() => ({
    paperSize,
    templateId: activeTemplateId,
    fontFamily,
    bodyFontSize,
    density,
    marginPreset,
    targetPages: pageLimit,
    exportFileName,
  }), [
    activeTemplateId,
    bodyFontSize,
    density,
    exportFileName,
    fontFamily,
    marginPreset,
    pageLimit,
    paperSize,
  ]);

  // B4.6.2.2 moves convergence below useResumePdf so the real PDF renderer
  // participates in the bounded final page-fit loop.

  const {
    blob: pdfBlob,
    url: pdfUrl,
    pageCount: pdfPageCount,
    isRendering: pdfRendering,
    error: pdfError,
    dirty: pdfDirty,
    synced: pdfSynced,
    lastGeneratedAt: pdfLastGeneratedAt,
    generatePdf,
    generateAndDownload,
  } = useResumePdf({
    resume: renderResume,
    settings: pageSettings,
    sectionLayouts,
  });


  const handleCreateConnectedDraft = async () => {
    if (!emailDraftPlan || !mailConnection.connected || !emailRecipient.trim()) return;
    if (!window.confirm(`确认在 Gmail 中创建 Draft？\n\n收件人：${emailRecipient.trim()}${emailDraftPlan.cc.length ? `\nCC：${emailDraftPlan.cc.join(', ')}` : ''}\n\n软件不会发送邮件。创建后请在邮箱中检查并由你本人点击 Send。`)) return;

    setMailDraftState('sending');
    setMailMessage('正在准备附件并创建邮箱 Draft…');
    try {
      const attachments: Array<{ fileName: string; mimeType: string; base64: string }> = [];
      if (includeResumeAttachment) {
        const result = await generatePdf();
        const resumeFileName = /\.pdf$/i.test(exportFileName) ? exportFileName : `${exportFileName || 'Resume'}.pdf`;
        attachments.push({
          fileName: resumeFileName,
          mimeType: 'application/pdf',
          base64: await blobToBase64(result.blob),
        });
      }
      if (includeCoverLetterAttachment) {
        if (!coverLetterDraft.trim()) throw new Error('Cover Letter 已勾选，但当前没有 Cover Letter Draft。');
        const coverLetterBlob = new Blob([coverLetterDraft], { type: 'text/plain;charset=utf-8' });
        attachments.push({ fileName: 'Cover_Letter.txt', mimeType: 'text/plain', base64: await blobToBase64(coverLetterBlob) });
      }

      const response = await fetch('/api/mail/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to: emailDraftPlan.to,
          cc: emailDraftPlan.cc,
          subject: emailDraftPlan.subject,
          body: emailDraftPlan.body,
          attachments,
        }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; draftId?: string; webUrl?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || '邮件创建 Draft 失败。');
      setMailDraftState('sent');
      setMailMessage(result.draftId ? `Draft 已创建 · ${result.draftId}` : 'Draft 已创建。');
      if (result.webUrl) window.open(result.webUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setMailDraftState('error');
      setMailMessage(error instanceof Error ? error.message : '邮件创建 Draft 失败。');
    }
  };


  // B4.6.2.2 Stable Multi-Pass Targeting
  // One user Apply may render the REAL PDF up to five times. PDF feedback is page geometry only;
  // semantic ranking remains frozen in TargetingAnalysis. Hard stop after five renders.
  useEffect(() => {
    if (!autoPageFill || !targetingApplied || !targetingAnalysis || pageLimit === 'none') return;

    const target = Number(pageLimit);
    const revisionKey = [
      layoutRevision,
      targetingAnalysis.jdFingerprint,
      pageLimit,
      paperSize,
      bodyFontSize,
      density,
      marginPreset,
      JSON.stringify(sectionLayouts),
    ].join('|');
    if (convergenceGateRef.current.revisionKey !== revisionKey) {
      convergenceGateRef.current = { revisionKey, corrections: 0 };
    }
    if (convergenceGateRef.current.corrections >= 5 || pdfRendering) return;

    const run = async () => {
      // Count the real renderer pass before awaiting it, preventing duplicate effects.
      convergenceGateRef.current.corrections += 1;
      const pass = convergenceGateRef.current.corrections;
      try {
        const rendered = await generatePdf();
        if (convergenceGateRef.current.revisionKey !== revisionKey) return;

        const equivalentPages = previewUsageByPage.reduce(
          (sum, value) => sum + Math.max(0, value) / 100,
          0,
        );
        const overflow = rendered.pageCount > target;
        const underfilled = rendered.pageCount > 0
          && rendered.pageCount <= target
          && equivalentPages < target * 0.90;

        // Good real PDF: stop immediately. 90–100% is intentionally accepted;
        // semantic quality is more important than forcing visual 100% fill.
        if (!overflow && !underfilled) {
          convergenceGateRef.current.corrections = 5;
          finalSelectionSnapshotRef.current = {
            revisionKey: applyRevisionRef.current,
            resume: JSON.parse(JSON.stringify(resume)) as ResumeDocument,
          };
          return;
        }
        if (pass >= 5) {
          finalSelectionSnapshotRef.current = {
            revisionKey: applyRevisionRef.current,
            resume: JSON.parse(JSON.stringify(resume)) as ResumeDocument,
          };
          return;
        }

        const metricSettings = { paperSize, bodyFontSize, density, marginPreset };
        const currentEstimated = estimateRenderedHeightPoints(renderResume, sectionLayouts, metricSettings);
        const calibratedPerPage = equivalentPages > 0.2
          ? currentEstimated / equivalentPages
          : availablePageHeightPoints(metricSettings);
        const measureFinalTree = (candidate: ResumeDocument) => {
          const plan = buildResumeLayoutPlan(candidate, targetingAnalysis.recommendations);
          const finalTree = buildRenderResume(candidate, plan, sectionLayouts, targetingAnalysis.recommendations);
          return estimateRenderedHeightPoints(finalTree, sectionLayouts, metricSettings);
        };

        setResume((current) => optimizeWholeResumeForPageTarget({
          resume: current,
          recommendations: targetingAnalysis.recommendations,
          targetPages: pageLimit,
          calibratedUnitsPerPage: calibratedPerPage,
          recommendationTiers: targetingAnalysis.recommendationTiers,
          measureResume: measureFinalTree,
        }).resume);
      } catch {
        // PDF UI already exposes renderer errors. Never create an unbounded retry loop.
        convergenceGateRef.current.corrections = 5;
      }
    };
    void run();
  }, [
    autoPageFill,
    targetingApplied,
    targetingAnalysis,
    pageLimit,
    layoutRevision,
    renderResume,
    sectionLayouts,
    paperSize,
    bodyFontSize,
    density,
    marginPreset,
    previewUsageByPage,
    generatePdf,
    pdfRendering,
    resume,
  ]);

  const atsReport = useMemo(
    () => validateAtsFormat(resume, pageSettings, sectionLayouts, pdfIntegrity),
    [resume, pageSettings, sectionLayouts, pdfIntegrity],
  );

  const handleApplySummaryV2 = () => {
    if (!targetingAnalysis?.engineV2.summary.generatedText) return;
    const summary = targetingAnalysis.engineV2.summary;
    const summaryCandidateIds = summary.clusters.flatMap((cluster) => cluster.memberIds);
    setResume((current) => applySummaryRecommendationSelection(
      current,
      summary.primaryId,
      summaryCandidateIds,
      {
        text: summary.generatedText,
        sourceIds: summary.sourceIds,
        sourceTexts: summary.sourceTexts,
        sourceReferences: summary.sourceReferences,
        selectedEvidenceIds: summary.selectedEvidenceIds,
        generationMode: summary.generationMode,
        jobFamilyIds: summary.jobFamilyIds,
        architectureId: summary.architectureId,
        patternIds: summary.patternIds,
      },
    ));
    setLayoutRevision((current) => current + 1);
  };

  const handleApplyTargeting = () => {
    if (!targetingAnalysis) return;
    // Targeting recommends content only. Never mutate a user's chosen section
    // layout as a side effect of applying recommendations. Layout suggestions
    // remain advisory until the user explicitly changes the selector.
    const nextLayouts = sectionLayouts;

    const revisionKey = [
      targetingAnalysis.jdFingerprint,
      pageLimit,
      paperSize,
      bodyFontSize,
      density,
      marginPreset,
      JSON.stringify(nextLayouts),
      autoPageFill ? 'auto-fill' : 'recommend-only',
    ].join('|');

    // A completed Apply is stable. A second/third click for the same revision is a no-op;
    // the bounded internal PDF passes below already perform the convergence work.
    if (targetingApplied && applyRevisionRef.current === revisionKey) {
      const frozen = finalSelectionSnapshotRef.current;
      if (frozen?.revisionKey === revisionKey) {
        setResume(JSON.parse(JSON.stringify(frozen.resume)) as ResumeDocument);
      }
      return;
    }

    const metricSettings = { paperSize, bodyFontSize, density, marginPreset };
    const measureFinalTree = (candidate: ResumeDocument) => {
      const plan = buildResumeLayoutPlan(candidate, targetingAnalysis.recommendations);
      const finalTree = buildRenderResume(candidate, plan, nextLayouts, targetingAnalysis.recommendations);
      return estimateRenderedHeightPoints(finalTree, nextLayouts, metricSettings);
    };

    // Always restart from the frozen Master snapshot, never from a previous Application result.
    const baseline = JSON.parse(JSON.stringify(masterResumeRef.current)) as ResumeDocument;
    const evidenceTargeted = applyRecommendedSelection(
      applyRecommendationScores(baseline, targetingAnalysis.recommendations),
      targetingAnalysis.selectedRecommendationIds,
      targetingAnalysis.recommendationCandidateIds,
    );
    const summaryCandidateIds = targetingAnalysis.engineV2.summary.clusters.flatMap((cluster) => cluster.memberIds);
    const targeted = applySummaryRecommendationSelection(
      evidenceTargeted,
      targetingAnalysis.engineV2.summary.primaryId,
      summaryCandidateIds,
      {
        text: targetingAnalysis.engineV2.summary.generatedText,
        sourceIds: targetingAnalysis.engineV2.summary.sourceIds,
        sourceTexts: targetingAnalysis.engineV2.summary.sourceTexts,
        sourceReferences: targetingAnalysis.engineV2.summary.sourceReferences,
        selectedEvidenceIds: targetingAnalysis.engineV2.summary.selectedEvidenceIds,
        generationMode: targetingAnalysis.engineV2.summary.generationMode,
        jobFamilyIds: targetingAnalysis.engineV2.summary.jobFamilyIds,
        architectureId: targetingAnalysis.engineV2.summary.architectureId,
        patternIds: targetingAnalysis.engineV2.summary.patternIds,
      },
    );
    const initial = pageLimit === 'none' || !autoPageFill
      ? targeted
      : optimizeWholeResumeForPageTarget({
          resume: targeted,
          recommendations: targetingAnalysis.recommendations,
          targetPages: pageLimit,
          calibratedUnitsPerPage: availablePageHeightPoints(metricSettings),
          recommendationTiers: targetingAnalysis.recommendationTiers,
          measureResume: measureFinalTree,
        }).resume;

    setResume(initial);
    setTargetingApplied(true);
    setLayoutRevision((current) => current + 1);
    convergenceGateRef.current = { revisionKey: '', corrections: 0 };
    finalSelectionSnapshotRef.current = null;
    applyRevisionRef.current = revisionKey;
  };

  const handleRunAtsIntegrity = async () => {
    setAtsChecking(true);
    try {
      const result = pdfBlob && !pdfDirty ? { blob: pdfBlob } : await generatePdf();
      setPdfIntegrity(await inspectPdfTextIntegrity(result.blob, renderResume));
    } finally {
      setAtsChecking(false);
    }
  };

  const handleSaveCurrentTemplate = () => {
    const template = createTemplateFromCurrent(`Template ${templates.length + 1}`, pageSettings, sectionLayouts, defaultShortWordLayout, resume);
    saveTemplate(template);
    setTemplates(loadTemplates());
    setTemplateMessage(uiLocale === 'zh' ? `已保存模板：${template.name}` : `Template saved: ${template.name}`);
  };

  const handleTemplateImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const result = await importTemplateFile(file);
      saveTemplate(result.template);
      setTemplates(loadTemplates());
      setTemplateMessage([uiLocale === 'zh' ? `已导入模板：${result.template.name}` : `Template imported: ${result.template.name}`, ...result.warnings].join(' '));
    } catch (error) {
      setTemplateMessage(error instanceof Error ? error.message : (uiLocale === 'zh' ? '模板导入失败。' : 'Template import failed.'));
    }
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const resolved = resolveTemplate(template, pageSettings, resume);
    updatePageSettings(resolved.settings);
    setSectionLayouts(resolved.sectionLayouts);
    if (template.defaultSectionLayout) setDefaultShortWordLayout(template.defaultSectionLayout);
    setTemplateMessage(uiLocale === 'zh' ? `已应用模板：${template.name}` : `Template applied: ${template.name}`);
  };

  // The generated PDF is authoritative once it exists.
  // Before the first PDF render completes, fall back to the existing layout estimate.
  const authoritativePageCount =
    pdfPageCount > 0 ? pdfPageCount : previewPageCount;

  const targetPageCount =
    pageLimit === 'none' ? null : Number(pageLimit);

  const pageFitStatus: 'safe' | 'warning' | 'overflow' =
    (targetPageCount !== null && authoritativePageCount > targetPageCount) ||
    previewMaxUsagePercent > 100
      ? 'overflow'
      : previewMaxUsagePercent >= 95
        ? 'warning'
        : 'safe';

  const pageFitLabel =
    pageFitStatus === 'overflow'
      ? targetPageCount !== null && authoritativePageCount > targetPageCount
        ? ui.pageCountOverflow(authoritativePageCount - targetPageCount)
        : ui.pageOverflow
      : pageFitStatus === 'warning'
        ? ui.pageWarning
        : ui.pageSafe;

  const updatePageSettings = (patch: Partial<PageSettings>) => {
    if (patch.paperSize) setPaperSize(patch.paperSize);
    if (patch.templateId) setActiveTemplateId(patch.templateId);
    if (patch.fontFamily) setFontFamily(patch.fontFamily as 'Arial' | 'Georgia' | 'Times New Roman' | 'Helvetica');
    if (typeof patch.bodyFontSize === 'number') setBodyFontSize(patch.bodyFontSize);
    if (patch.density) setDensity(patch.density);
    if (patch.marginPreset) setMarginPreset(patch.marginPreset);
    if (patch.targetPages) setPageLimit(patch.targetPages);
    if (typeof patch.exportFileName === 'string') setExportFileName(patch.exportFileName);
    if (Object.keys(patch).some((key) => key !== 'exportFileName')) {
      setLayoutRevision((current) => current + 1);
      convergenceGateRef.current = { revisionKey: '', corrections: 0 };
    }
  };

  const paperStyle = useMemo<CSSProperties>(() => {
    const margins = {
      compact: '24px 26px',
      standard: '38px 34px',
      wide: '48px 44px',
    } as const;

    const lineHeights = {
      compact: 1.2,
      standard: 1.34,
      relaxed: 1.5,
    } as const;

    return {
      fontFamily: `${fontFamily}, Arial, Helvetica, sans-serif`,
      fontSize: `${bodyFontSize}pt`,
      lineHeight: lineHeights[density],
      padding: margins[marginPreset],
      aspectRatio: paperSize === 'a4' ? '210 / 297' : '8.5 / 11',
      boxSizing: 'border-box',
    };
  }, [bodyFontSize, density, fontFamily, marginPreset, paperSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const deletedRaw = localStorage.getItem(DELETED_STORAGE_KEY);
        const now = Date.now();
        const storedDeleted = deletedRaw ? JSON.parse(deletedRaw) as Array<DeletedModuleItem<ResumeModule>> : [];
        const activeDeleted = storedDeleted.filter((item) => new Date(item.expiresAt).getTime() > now);
        setDeletedModules(activeDeleted);
        localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(activeDeleted));

        // Never let a late draft-hydration write replace a resume the user explicitly
        // imported during startup. This is editor hydration coordination, not parser logic.
        if (!explicitResumeLoadRef.current) {
          const draftRaw = localStorage.getItem(DRAFT_STORAGE_KEY);
          if (draftRaw) {
            const draft = JSON.parse(draftRaw) as {
              resume?: ResumeDocument;
              sectionLayouts?: Record<string, SectionLayoutMode>;
              defaultShortWordLayout?: SectionLayoutMode;
              settings?: Partial<PageSettings>;
              savedAt?: string;
            };
            if (draft.resume?.sections) setResume(draft.resume);
            if (draft.sectionLayouts) setSectionLayouts(draft.sectionLayouts);
            if (draft.defaultShortWordLayout) setDefaultShortWordLayout(draft.defaultShortWordLayout);
            if (draft.settings) updatePageSettings(draft.settings);
            if (draft.savedAt) setLastSavedAt(new Date(draft.savedAt));
          }
        }
      } catch {
        // Corrupt local draft should not prevent the editor from opening.
      } finally {
        setDraftHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const saveDraftNow = useCallback(() => {
    if (!draftHydrated) return;
    setIsSavingDraft(true);
    const savedAt = new Date();
    const payload = {
      resume,
      sectionLayouts,
      defaultShortWordLayout,
      settings: pageSettings,
      savedAt: savedAt.toISOString(),
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    setLastSavedAt(savedAt);
    window.setTimeout(() => setIsSavingDraft(false), 220);
  }, [draftHydrated, resume, sectionLayouts, defaultShortWordLayout, pageSettings]);

  useEffect(() => {
    if (!draftHydrated) return;
    const timer = window.setTimeout(() => {
      saveDraftNow();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftHydrated, saveDraftNow]);

  useEffect(() => {
    if (!draftHydrated) return;
    localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify(deletedModules));
  }, [deletedModules, draftHydrated]);

  const visibleSections = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return resume.sections;

    const filterTree = (nodes: ResumeModule[]): ResumeModule[] =>
      nodes.flatMap((node) => {
        const children = node.children ? filterTree(node.children) : [];
        const matches =
          node.title.toLowerCase().includes(normalized) ||
          node.subtitle?.toLowerCase().includes(normalized) ||
          node.content?.toLowerCase().includes(normalized);
        return matches || children.length ? [{ ...node, children }] : [];
      });

    return filterTree(resume.sections);
  }, [resume.sections, search]);

  const handleToggle = (module: ResumeModule) => {
    if (module.locked) return;
    const nextSelected = !module.selected;
    setResume((current) => ({
      ...current,
      sections: toggleSelectionTree(current.sections, module.id, nextSelected),
    }));
    // A manual selection is authoritative. Do not let Auto Page Fill immediately
    // converge back over the user's explicit add/remove choice.
    if (targetingApplied) {
      convergenceGateRef.current = { revisionKey: applyRevisionRef.current, corrections: 5 };
      finalSelectionSnapshotRef.current = null;
      setTargetingApplied(false);
    }
    setLayoutRevision((current) => current + 1);
  };

  const handleToggleLock = (module: ResumeModule) => {
    const nextLocked = !module.locked;
    setResume((current) => {
      const next = {
        ...current,
        sections: setModuleLockTree(current.sections, module.id, nextLocked),
      };
      // Fixed is a user decision, including when made after JD analysis. Refresh the
      // Master baseline so Apply cannot resurrect a pre-Fixed snapshot.
      masterResumeRef.current = JSON.parse(JSON.stringify(next)) as ResumeDocument;
      return next;
    });
    if (targetingApplied) {
      convergenceGateRef.current = { revisionKey: applyRevisionRef.current, corrections: 5 };
      finalSelectionSnapshotRef.current = null;
      setTargetingApplied(false);
    }
  };

  const handleTogglePriority = (module: ResumeModule) => {
    setResume((current) => ({
      ...current,
      sections: updateModuleTree(current.sections, module.id, { targetingPriority: !module.targetingPriority }),
    }));
    // Priority is semantic intent, so the user should re-run Targeting.
    setAnalysisReady(false);
    setTargetingAnalysis(null);
    setTargetingApplied(false);
  };

  const handleSetTrimPoint = (module: ResumeModule) => {
    if (module.locked || module.kind !== 'bullet') return;
    const full = module.content ?? module.title;
    const suggestNaturalBreakpoint = (text: string) => {
      const min = Math.max(36, Math.floor(text.length * 0.52));
      const candidates = [',', ';', '—', ' – ', '.'].flatMap((token) => {
        const hits: number[] = [];
        let from = min;
        while (from < text.length - 12) {
          const at = text.indexOf(token, from);
          if (at < 0) break;
          hits.push(at + token.length);
          from = at + token.length;
        }
        return hits;
      }).sort((a, b) => a - b);
      const cut = candidates[0];
      return cut ? text.slice(0, cut).trim().replace(/[,;–—]+$/, '').trim() : text;
    };
    // Natural punctuation is only a suggestion. The user must confirm the compact wording;
    // the optimizer is never allowed to invent or silently truncate resume evidence.
    const current = module.compactContent ?? suggestNaturalBreakpoint(full);
    const value = window.prompt(
      '建议断点已按自然标点预填。请人工确认短版本仍保持事实与原意；留空可移除断点。\n\n完整版本：\n' + full,
      current,
    );
    if (value === null) return;
    const compact = value.trim();
    setResume((currentResume) => {
      const next = {
        ...currentResume,
        sections: updateModuleTree(currentResume.sections, module.id, {
          compactContent: compact && compact !== full.trim() ? compact : undefined,
          useCompactContent: false,
        }),
      };
      return next;
    });
    invalidateTargetingAfterSemanticEdit();
    setLayoutRevision((currentRevision) => currentRevision + 1);
  };

  const handleMoveSibling = (module: ResumeModule, direction: -1 | 1) => {
    if (module.locked) return;
    setResume((current) => {
      const move = (nodes: ResumeModule[]): ResumeModule[] => {
        const index = nodes.findIndex((node) => node.id === module.id);
        if (index >= 0) {
          const target = index + direction;
          if (target < 0 || target >= nodes.length || nodes[target].locked) return nodes;
          return arrayMove(nodes, index, target);
        }
        return nodes.map((node) => node.children ? { ...node, children: move(node.children) } : node);
      };
      return { ...current, sections: move(current.sections) };
    });
    invalidateTargetingAfterSemanticEdit();
    setLayoutRevision((current) => current + 1);
  };

  const handleToggleCompactSkills = (module: ResumeModule) => {
    if (module.locked || !hasCompactShortSkillCandidates(module)) return;
    setResume((current) => ({
      ...current,
      sections: updateModuleTree(current.sections, module.id, { compactShortSkills: !module.compactShortSkills }),
    }));
    setLayoutRevision((current) => current + 1);
  };

  const handleMoveParent = (module: ResumeModule) => {
    if (module.locked || (module.kind !== 'entry' && module.kind !== 'bullet')) return;

    // ↔ is a type conversion control, not a cross-parent move.
    // Bullet -> Entry keeps the same factual text as the entry title.
    // Entry -> Bullet preserves child content by lifting existing children one level
    // next to the converted bullet, so conversion never silently deletes evidence.
    if (module.kind === 'entry' && (module.children?.length ?? 0) > 0) {
      const confirmed = window.confirm(
        `条目「${module.title}」包含 ${(module.children ?? []).length} 个子项。\n\n转换成 Bullet 后，这些子项会提升到同一层级并保留，不会删除。是否继续？`,
      );
      if (!confirmed) return;
    }

    setResume((current) => {
      const convert = (nodes: ResumeModule[]): ResumeModule[] => nodes.flatMap((node) => {
        if (node.id === module.id) {
          if (node.kind === 'bullet') {
            const text = (node.content ?? node.title).trim();
            return [{
              ...node,
              kind: 'entry' as const,
              title: text || '新条目',
              subtitle: '',
              content: undefined,
              children: [],
            }];
          }

          const bulletText = [node.title, node.subtitle, node.content]
            .map((value) => value?.trim())
            .filter(Boolean)
            .join(' | ');
          const lifted = (node.children ?? []).map((child) => ({ ...child }));
          return [{
            ...node,
            kind: 'bullet' as const,
            title: bulletText || node.title || '新 Bullet',
            content: bulletText || node.title || '新 Bullet',
            subtitle: undefined,
            children: undefined,
            compactShortSkills: undefined,
          }, ...lifted];
        }
        return [{ ...node, children: node.children ? convert(node.children) : undefined }];
      });
      return { ...current, sections: convert(current.sections) };
    });
    invalidateTargetingAfterSemanticEdit();
    setLayoutRevision((current) => current + 1);
  };

  const handleRename = (
    module: ResumeModule,
    value: string,
    field: 'title' | 'subtitle' = 'title',
  ) => {
    const patch: Partial<ResumeModule> =
      field === 'subtitle'
        ? { subtitle: value }
        : module.kind === 'bullet'
          ? { content: value, title: value }
          : { title: value };

    setResume((current) => ({
      ...current,
      sections: updateModuleTree(current.sections, module.id, patch),
    }));
    invalidateTargetingAfterSemanticEdit();
  };

  const handleAddSection = () => {
    const newSection: ResumeModule = {
      id: createModuleId('section'),
      kind: 'section',
      title: '新模块',
      selected: true,
      locked: false,
      children: [],
    };
    setResume((current) => ({ ...current, sections: [...current.sections, newSection] }));
    invalidateTargetingAfterSemanticEdit();
  };

  const handleAddChild = (parent: ResumeModule, kind: 'entry' | 'bullet' | 'skill') => {
    let child: ResumeModule;
    if (kind === 'entry') {
      child = { id: createModuleId('entry'), kind: 'entry', title: '新条目', subtitle: '', selected: false, locked: false, children: [] };
    } else if (kind === 'skill') {
      child = { id: createModuleId('skill'), kind: 'skill', title: '新技能', selected: true, locked: false };
    } else {
      child = { id: createModuleId('bullet'), kind: 'bullet', title: '新的描述内容', content: '新的描述内容', selected: false, locked: false };
    }
    setResume((current) => ({
      ...current,
      sections: kind === 'entry' || kind === 'bullet'
        ? prependChildToTree(current.sections, parent.id, child)
        : appendChildToTree(current.sections, parent.id, child),
    }));
    invalidateTargetingAfterSemanticEdit();
  };


  const handleImportBullets = (parent: ResumeModule) => {
    if (parent.locked || parent.kind !== 'entry') return;

    const importText = (text: string) => {
      const bullets = parseBulletImportText(text);
      if (!bullets.length) {
        setImportError('未识别到可导入的 Bullet。');
        return;
      }
      setResume((current) => ({
        ...current,
        sections: prependChildrenToTree(current.sections, parent.id, bullets),
      }));
      invalidateTargetingAfterSemanticEdit();
      setImportError('');
    };

    const pasted = window.prompt('粘贴一个或多个 Bullet（每行一个或 Markdown 列表）。\n若要从 .txt/.md/.json 文件导入，请留空并点击“确定”。', '');
    if (pasted === null) return;
    if (pasted.trim()) {
      importText(pasted);
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.markdown,.json,text/plain,text/markdown,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try { importText(await file.text()); }
      catch { setImportError('Bullet 导入失败。请使用 TXT、Markdown 或 JSON。'); }
    };
    input.click();
  };

  const handleDelete = (module: ResumeModule) => {
    if (module.locked) return;
    const message = module.kind === 'section'
      ? `删除「${module.title}」会同时删除其中所有内容。10 天内可恢复。确定继续吗？`
      : `删除「${module.title}」？10 天内可恢复。`;
    if (!window.confirm(message)) return;

    const location = findModuleLocation(resume.sections, module.id);
    if (!location) return;

    const deletedAt = new Date();
    const expiresAt = new Date(deletedAt.getTime() + DELETED_RETENTION_DAYS * 86400000);
    const deletedItem: DeletedModuleItem<ResumeModule> = {
      id: `${module.id}:${deletedAt.getTime()}`,
      module: location.module,
      parentId: location.parentId,
      index: location.index,
      deletedAt: deletedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    setDeletedModules((current) => [deletedItem, ...current]);
    setResume((current) => ({ ...current, sections: removeModuleFromTree(current.sections, module.id) }));
    invalidateTargetingAfterSemanticEdit();
  };

  const restoreDeletedModule = (deletedId: string) => {
    const item = deletedModules.find((candidate) => candidate.id === deletedId);
    if (!item) return;
    setResume((current) => ({
      ...current,
      sections: insertModuleAt(current.sections, item.parentId, item.index, item.module),
    }));
    setDeletedModules((current) => current.filter((candidate) => candidate.id !== deletedId));
    invalidateTargetingAfterSemanticEdit();
  };

  const deleteModuleForever = (deletedId: string) => {
    if (!window.confirm('永久删除后不能恢复。确定继续吗？')) return;
    setDeletedModules((current) => current.filter((candidate) => candidate.id !== deletedId));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setResume((current) => {
      const next = {
        ...current,
        sections: reorderSiblingTree(current.sections, String(active.id), String(over.id)),
      };
      return next;
    });
    invalidateTargetingAfterSemanticEdit();
    setLayoutRevision((current) => current + 1);
  };

  const handleSectionLayoutChange = (sectionId: string, layout: SectionLayoutMode) => {
    setSectionLayouts((current) => ({ ...current, [sectionId]: layout }));
    setLayoutRevision((current) => current + 1);
    convergenceGateRef.current = { revisionKey: '', corrections: 0 };
  };

  const handleOwnerNameChange = (value: string) => {
    const metadata = { ...resume, name: value, candidateName: value };
    syncOwnerMetadataAcrossSnapshots(metadata);
    setResume((current) => ({ ...current, name: value, candidateName: value }));
  };

  const handleOwnerContactChange = (value: string) => {
    const metadata = { ...resume, contactLine: value };
    syncOwnerMetadataAcrossSnapshots(metadata);
    setResume((current) => ({ ...current, contactLine: value }));
  };


  const parseMarkdownModule = (text: string, fallbackTitle: string): ResumeModule => {
    const lines = text.split(/\r?\n/);
    let sectionTitle = fallbackTitle.replace(/\.[^.]+$/, '') || '导入模块';
    const entries: ResumeModule[] = [];
    let currentEntry: ResumeModule | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line.replace(/\s+/g, ''))) continue;

      if (line.startsWith('## ')) {
        sectionTitle = line.slice(3).trim() || sectionTitle;
        continue;
      }

      if (line.startsWith('### ')) {
        currentEntry = {
          id: createModuleId('entry'),
          kind: 'entry',
          title: line.slice(4).trim() || '新条目',
          subtitle: '',
          selected: true,
          locked: false,
          children: [],
        };
        entries.push(currentEntry);
        continue;
      }

      if (line.startsWith('- ') || line.startsWith('* ')) {
        const content = line.slice(2).trim();
        const bullet: ResumeModule = {
          id: createModuleId('bullet'),
          kind: 'bullet',
          title: content || '新的描述内容',
          content: content || '新的描述内容',
          selected: true,
          locked: false,
        };

        if (!currentEntry) {
          currentEntry = {
            id: createModuleId('entry'),
            kind: 'entry',
            title: '导入内容',
            subtitle: '',
            selected: true,
            locked: false,
            children: [],
          };
          entries.push(currentEntry);
        }

        currentEntry.children = [...(currentEntry.children ?? []), bullet];
      }
    }

    if (entries.length === 0) {
      entries.push({
        id: createModuleId('entry'),
        kind: 'entry',
        title: sectionTitle,
        subtitle: '',
        selected: true,
        locked: false,
        children: text.trim()
          ? [{
              id: createModuleId('bullet'),
              kind: 'bullet',
              title: text.trim(),
              content: text.trim(),
              selected: true,
              locked: false,
            }]
          : [],
      });
    }

    return {
      id: createModuleId('section'),
      kind: 'section',
      title: sectionTitle,
      selected: true,
      locked: false,
      children: entries,
    };
  };

  const handleModuleImportClick = () => {
    setImportError('');
    moduleImportInputRef.current?.click();
  };

  const handleModuleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let imported: ResumeModule;

      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text) as ResumeModule;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.kind !== 'string') {
          throw new Error('Invalid module JSON');
        }
        imported = {
          ...parsed,
          id: parsed.id || createModuleId('section'),
          selected: parsed.selected ?? true,
          locked: parsed.locked ?? false,
        };
      } else {
        imported = parseMarkdownModule(text, file.name);
      }

      setResume((current) => ({
        ...current,
        sections: imported.kind === 'section'
          ? [...current.sections, imported]
          : [
              ...current.sections,
              {
                id: createModuleId('section'),
                kind: 'section',
                title: imported.title || '导入模块',
                selected: true,
                locked: false,
                children: [imported],
              },
            ],
      }));
      invalidateTargetingAfterSemanticEdit();
      setImportError('');
    } catch {
      setImportError('模块导入失败。请使用模块 JSON、Markdown 或纯文本文件。');
    } finally {
      event.target.value = '';
    }
  };

  const handleImportClick = () => {
    importModeRef.current = 'replace';
    setImportError('');
    importInputRef.current?.click();
  };

  const handleAppendImportClick = () => {
    importModeRef.current = 'append';
    setImportError('');
    importInputRef.current?.click();
  };

  const handleImportFile = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    explicitResumeLoadRef.current = true;

    try {
      const name = file.name.toLowerCase();
      let importedResume: ResumeDocument;

      if (name.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text) as ResumeDocument;
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !Array.isArray(parsed.sections)
        ) {
          throw new Error('Invalid ResumeDocument');
        }
        importedResume = parsed;
      } else if (name.endsWith('.docx')) {
        importedResume = await parseDocxResume(await file.arrayBuffer(), file.name);
      } else if (
        name.endsWith('.md') ||
        name.endsWith('.markdown') ||
        name.endsWith('.txt')
      ) {
        importedResume = parseImportedMarkdownResume(await file.text(), file.name);
      } else {
        throw new Error('Unsupported file');
      }

      // Build a fresh canonical document before any React state write. Root identity
      // metadata is explicit; section cloning must never decide candidate/contact data.
      const importedCandidateName = (importedResume.candidateName ?? importedResume.name).trim() || importedResume.name;
      importedResume = {
        ...JSON.parse(JSON.stringify(importedResume)) as ResumeDocument,
        name: importedCandidateName,
        candidateName: importedCandidateName,
        contactLine: String(importedResume.contactLine ?? '').trim(),
        sections: JSON.parse(JSON.stringify(importedResume.sections)) as ResumeModule[],
      };

      if (importModeRef.current === 'append') {
        // Append by section title. Never silently merge/deduplicate factual entries;
        // imported modules retain their own identity and remain user-reviewable.
        setResume((current) => {
          const next = JSON.parse(JSON.stringify(current)) as ResumeDocument;
          if (!next.contactLine.trim() && importedResume.contactLine.trim()) next.contactLine = importedResume.contactLine;
          if (!(next.candidateName ?? next.name).trim() && (importedResume.candidateName ?? importedResume.name).trim()) {
            next.name = importedResume.candidateName ?? importedResume.name;
            next.candidateName = next.name;
          }
          for (const incomingSection of importedResume.sections) {
            const existing = next.sections.find(
              (section) => section.title.trim().toLowerCase() === incomingSection.title.trim().toLowerCase(),
            );
            if (existing) {
              existing.children = [...(existing.children ?? []), ...(incomingSection.children ?? [])];
            } else {
              next.sections.push(incomingSection);
            }
          }
          masterResumeRef.current = JSON.parse(JSON.stringify(next)) as ResumeDocument;
          return next;
        });
      } else {
        const replaced = JSON.parse(JSON.stringify(importedResume)) as ResumeDocument;
        replaced.contactLine = String(importedResume.contactLine ?? '').trim();
        replaced.candidateName = (importedResume.candidateName ?? importedResume.name).trim() || importedResume.name;
        replaced.name = replaced.candidateName;

        // Replace means replacing the entire ResumeDocument atomically, including root
        // metadata. Master and live editor receive independent clones. The one-shot
        // guard above protects this identity from a stale/default same-cycle write.
        pendingReplaceIdentityRef.current = {
          resumeId: replaced.id,
          name: replaced.name,
          candidateName: replaced.candidateName,
          contactLine: replaced.contactLine,
        };
        // Replace is a user-visible atomic action. Commit the canonical root metadata
        // synchronously so the controlled Contact field cannot observe the previous/default
        // ResumeDocument between the file-input event and the following reset writes.
        const masterReplacement = JSON.parse(JSON.stringify(replaced)) as ResumeDocument;
        const liveReplacement = JSON.parse(JSON.stringify(replaced)) as ResumeDocument;
        masterResumeRef.current = masterReplacement;
        flushSync(() => {
          setResume(liveReplacement);
        });

        // Keep a same-turn repair as a narrow safety net for any state callback queued by
        // the surrounding workbench before the Replace event completed. It only restores
        // root identity fields for this imported resume id and never touches the module tree.
        queueMicrotask(() => {
          const identity = pendingReplaceIdentityRef.current;
          if (!identity) return;
          setResume((current) => {
            if (current.id !== identity.resumeId) return current;
            const currentCandidate = current.candidateName ?? current.name;
            if (
              current.name === identity.name
              && currentCandidate === identity.candidateName
              && current.contactLine === identity.contactLine
            ) return current;
            return {
              ...current,
              name: identity.name,
              candidateName: identity.candidateName,
              contactLine: identity.contactLine,
            };
          });
        });
      }
      setPreviewPageIndex(0);
      setAnalysisReady(false);
      setTargetingAnalysis(null);
      setTargetingApplied(false);
      setPdfIntegrity(undefined);
      setLayoutRevision((current) => current + 1);
      convergenceGateRef.current = { revisionKey: '', corrections: 0 };
      applyRevisionRef.current = '';
      finalSelectionSnapshotRef.current = null;
      setImportError('');
    } catch {
      setImportError(
        '简历导入失败。当前支持 JSON、Markdown (.md/.markdown)、DOCX 和 TXT。',
      );
    } finally {
      event.target.value = '';
    }
  };

  const handleUpdatePdf = async () => {
    try {
      await generatePdf();
    } catch {
      // Error text is already exposed in PdfPreview / PDF status.
    }
  };

  const handleExportPdf = async () => {
    const ok = await generateAndDownload();

    if (!ok && pdfError) {
      window.alert(pdfError);
    } else if (!ok) {
      window.alert(uiLocale === 'zh' ? 'PDF 生成失败，请重试。' : 'PDF generation failed. Please try again.');
    }
  };
  const handleMobilePaneChange = (pane: 'preview' | 'modules' | 'job') => setMobilePane(pane);

  return (
    <>
    <main className={styles.shell}>
      <header className={styles.topBar}>
        <div className={styles.brandBlock}>
          <div className={styles.brandMark} aria-label={uiLocale === 'zh' ? 'myC 标志' : 'myC logo'}>
            <span>my</span><strong>C</strong>
          </div>
          <div>
            <h1>{uiLocale === 'zh' ? '模块化简历' : 'Modular Resume'}</h1>
            <span>{ui.brandSubtitle}</span>
          </div>
        </div>
        <div className={styles.topActions}>
          <div className={styles.languageToggle} aria-label="UI language">
            <button
              type="button"
              className={uiLocale === 'zh' ? styles.languageActive : ''}
              onClick={() => setUiLocale('zh')}
            >
              {uiLocale === 'zh' ? '中文' : 'Chinese'}
            </button>
            <button
              type="button"
              className={uiLocale === 'en' ? styles.languageActive : ''}
              onClick={() => setUiLocale('en')}
            >
              {uiLocale === 'zh' ? '英文' : 'English'}
            </button>
          </div>
          <DraftStatus
            locale={uiLocale}
            isSaving={isSavingDraft}
            lastSavedLabel={lastSavedAt ? lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (uiLocale === 'zh' ? '未保存' : 'Not saved')}
            onSaveNow={saveDraftNow}
          />
          <button type="button" className={styles.secondaryButton} onClick={() => setDeletedPanelOpen((value) => !value)}>
            {uiLocale === 'zh' ? '已删除' : 'Deleted'} {deletedModules.length ? `(${deletedModules.length})` : ''}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.md,.markdown,.docx,.txt,application/json,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            hidden
            onChange={handleImportFile}
          />
          <input
            ref={moduleImportInputRef}
            type="file"
            accept="application/json,.json,text/markdown,.md,text/plain,.txt"
            hidden
            onChange={handleModuleImportFile}
          />
          <button type="button" className={`${styles.secondaryButton} ${styles.importResumeButton}`} onClick={handleImportClick}>{ui.importResume}{uiLocale === 'zh' ? '（覆盖）' : ' (Replace)'}</button>
          <button type="button" className={styles.secondaryButton} onClick={handleAppendImportClick}>{uiLocale === 'zh' ? '追加简历' : 'Append Resume'}</button>
          <button
            type="button"
            className={styles.pdfGenerateButton}
            onClick={handleUpdatePdf}
            disabled={pdfRendering || (!pdfDirty && Boolean(pdfUrl))}
          >
            {pdfRendering
              ? ui.pdfGenerating
              : pdfUrl
                ? pdfDirty
                  ? ui.updatePdf
                  : ui.pdfSynced
                : ui.generatePdf}
          </button>
          <button type="button" className={`${styles.primaryButton} ${styles.exportPdfButton}`} onClick={handleExportPdf}>{ui.exportPdf}</button>
        </div>
      </header>

      {importError && <div className={styles.errorBanner} role="alert">{importError}</div>}

      <div className={styles.workspace}>
        <section className={`${styles.panel} ${styles.previewPanel} ${mobilePane !== 'preview' ? styles.mobileHidden : ''}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2>{ui.pdfPreview}</h2>
              <p>
                {ui.pdfPreviewHint}
              </p>
            </div>
            <span className={styles.liveBadge}>
              {pdfRendering
                ? ui.rendering
                : pdfSynced
                  ? ui.synced
                  : ui.pendingUpdate}
            </span>
          </div>
          <ResumeRenderer
            locale={uiLocale}
            pageCount={authoritativePageCount}
            pageIndex={Math.min(
              previewPageIndex,
              Math.max(0, authoritativePageCount - 1),
            )}
            usagePercent={previewUsagePercent}
            fitStatus={pageFitStatus}
            fitLabel={pageFitLabel}
            pdfDirty={pdfDirty}
            pdfRendering={pdfRendering}
            pdfHasFile={Boolean(pdfUrl)}
            onUpdatePdf={handleUpdatePdf}
            onPageChange={setPreviewPageIndex}
            onOpenSettings={() => setPageSettingsOpen(true)}
          >
            <PdfPreview
              url={pdfUrl}
              pageIndex={previewPageIndex}
              isRendering={pdfRendering}
              dirty={pdfDirty}
              error={pdfError}
              locale={uiLocale}
            />
          </ResumeRenderer>

          <div className={styles.paginationProbeHost} aria-hidden="true">
            <PaginatedResumePreview
              resume={renderResume}
              paperStyle={paperStyle}
              sectionLayouts={sectionLayouts}
              pageIndex={previewPageIndex}
              paperSize={paperSize}
              onMetrics={handlePreviewMetrics}
            />
          </div>
        </section>

        <section className={`${styles.panel} ${styles.modulePanel} ${tabletPane !== 'modules' ? styles.tabletHidden : ''} ${mobilePane !== 'modules' ? styles.mobileHidden : ''}`}>
          <div className={styles.panelHeader}>
            <div><h2>{ui.moduleSelection}</h2><p>{ui.moduleSelectionHint}</p></div>
            <span className={styles.counter}>{counts.selected}/{counts.total}</span>
          </div>

          <TabletSwitcher value={tabletPane} onChange={setTabletPane} locale={uiLocale} />

          <div className={styles.ownerEditor}>
            <div className={styles.ownerEditorHeader}>
              <strong>{ui.resumeOwner}</strong>
              <span>{uiLocale === 'zh' ? '修改后实时同步到预览' : 'Changes sync to the preview immediately'}</span>
            </div>
            <label className={styles.ownerField}>
              <span>{ui.name}</span>
              <input value={resume.candidateName ?? resume.name} onChange={(event) => handleOwnerNameChange(event.target.value)} placeholder={uiLocale === 'zh' ? '候选人姓名' : 'Candidate name'} aria-label={uiLocale === 'zh' ? '候选人姓名' : 'Candidate name'} />
            </label>
            <label className={styles.ownerField}>
              <span>{ui.contact}</span>
              <input value={resume.contactLine} onChange={(event) => handleOwnerContactChange(event.target.value)} placeholder="Email · Phone · Location · LinkedIn" aria-label="Contact" />
            </label>
          </div>

          <div className={styles.moduleToolbar}>
            <input className={styles.searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ui.searchPlaceholder} />
            <button type="button" className={styles.iconButton} onClick={handleAddSection}>＋ {ui.addModule}</button>
            <button type="button" className={styles.iconButton} onClick={handleModuleImportClick}>⇧ {ui.importModule}</button>
          </div>

          {dndReady ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className={styles.moduleList}>
                <SortableModuleList
                  modules={visibleSections}
                  depth={0}
                  onToggle={handleToggle}
                  onRename={handleRename}
                  onAddChild={handleAddChild}
                  onImportBullets={handleImportBullets}
                  onDelete={handleDelete}
                  onToggleLock={handleToggleLock}
                  onTogglePriority={handleTogglePriority}
                  onSetTrimPoint={handleSetTrimPoint}
                  onMoveParent={handleMoveParent}
                  onMoveSibling={handleMoveSibling}
                  onToggleCompactSkills={handleToggleCompactSkills}
                  moduleAttention={targetingAnalysis?.moduleAttention ?? {}}
                  sectionLayouts={sectionLayouts}
                  onSectionLayoutChange={handleSectionLayoutChange}
                  locale={uiLocale}
                />
              </div>
            </DndContext>
          ) : (
            <div className={`${styles.moduleList} ${styles.moduleListLoading}`}>
              {uiLocale === 'zh' ? '正在载入模块编辑器…' : 'Loading module editor…'}
            </div>
          )}
        </section>

        <aside className={`${styles.panel} ${styles.jobPanel} ${tabletPane !== 'job' ? styles.tabletHidden : ''} ${mobilePane !== 'job' ? styles.mobileHidden : ''}`}>
          <div className={styles.panelHeader}><div><h2>{ui.jobDescription}</h2><p>{ui.jobDescriptionHint}</p></div></div>
          <TabletSwitcher value={tabletPane} onChange={setTabletPane} locale={uiLocale} />
          <nav className={styles.jobMiniNav} aria-label={uiLocale === 'zh' ? '职位分析导航' : 'Job analysis navigation'}>
            <button type="button" onClick={() => scrollJobPanelTo('match')}>{uiLocale === 'zh' ? '匹配' : 'Match'}</button>
            <button type="button" onClick={() => scrollJobPanelTo('targeting')}>{uiLocale === 'zh' ? '推荐' : 'Targeting'}</button>
            <button type="button" onClick={() => scrollJobPanelTo('ats')}>ATS</button>
            <button type="button" onClick={() => scrollJobPanelTo('template')}>{uiLocale === 'zh' ? '模板' : 'Template'}</button>
            <button type="button" onClick={() => scrollJobPanelTo('cover')}>{uiLocale === 'zh' ? '求职信' : 'Cover Letter'}</button>
          </nav>
          <div ref={jobScrollRef} className={styles.jobPanelScroll}>
          <label className={styles.fieldLabel} htmlFor="job-description">{uiLocale === 'zh' ? '职位描述' : 'Job Description'}</label>
          <textarea id="job-description" className={styles.jobTextarea} value={jobDescription} onChange={(event) => { const nextJobDescription = event.target.value; const previousInferred = inferJdApplicationEmail(jobDescription); const nextInferred = inferJdApplicationEmail(nextJobDescription); const previousRoleInferred = inferJdJobTitle(jobDescription); const nextRoleInferred = inferJdJobTitle(nextJobDescription); setJobDescription(nextJobDescription); setRoleName((current) => { const normalized = current.trim().toLowerCase(); return !normalized || (previousRoleInferred && normalized === previousRoleInferred.toLowerCase()) ? nextRoleInferred : current; }); setEmailRecipient((current) => { const normalized = current.trim().toLowerCase(); return !normalized || (previousInferred && normalized === previousInferred.toLowerCase()) ? nextInferred : current; }); setAnalysisReady(false); setTargetingAnalysis(null); setTargetingApplied(false); convergenceGateRef.current = { revisionKey: '', corrections: 0 }; }} placeholder={uiLocale === 'zh' ? '在这里粘贴目标岗位的职位描述...' : 'Paste the target Job Description here...'} />
          <button type="button" className={styles.primaryButton} disabled={!jobDescription.trim()} onClick={runTargetingAnalysis}>{ui.analyzeJob}</button>
          <div className={styles.divider} />
          <section className={styles.analysisBlock} data-job-section="match">
            <h3>{uiLocale === 'zh' ? '匹配概览' : 'Match Overview'}</h3>
            {analysisReady && keywordMatches.length > 0 ? (
              <>
                <div className={styles.keywordList}>
                  {keywordMatches.filter((item) => item.matched).slice(0, 6).map((item) => (
                    <span key={item.keyword} className={styles.keywordMatched}>✓ {item.keyword}</span>
                  ))}
                </div>
                <div className={styles.metricRow}>
                  <span>{uiLocale === 'zh' ? '已支持职位要求' : 'requirements supported'}</span>
                  <strong>{matchedKeywordCount} / {keywordMatches.length}</strong>
                </div>
              </>
            ) : <p className={styles.emptyText}>{analysisReady ? ui.noKeywords : ui.pasteJobHint}</p>}
          </section>

          {targetingAnalysis && (
          <div className={styles.analysisBlock}>
            <h3>{uiLocale === 'zh' ? '职业摘要 V2' : 'Professional Summary V2'}</h3>
            {targetingAnalysis.engineV2.summary.generatedText ? (
              <>
                <p className={styles.emptyText}>
                  {targetingAnalysis.engineV2.summary.generationMode === 'multi-reference'
                    ? (uiLocale === 'zh' ? `V2 已从 ${(targetingAnalysis.engineV2.summary.sourceIds?.length ?? 0)} 个高相关摘要合并，并用最终工作/项目证据重构。` : `V2 merged ${(targetingAnalysis.engineV2.summary.sourceIds?.length ?? 0)} highly relevant summaries and reconstructed them using final Work/Project evidence.`)
                    : (uiLocale === 'zh' ? 'V2 已根据当前最高相关摘要与最终工作/项目证据生成重写候选。' : 'V2 generated a rewrite candidate from the most relevant Summary and final Work/Project evidence.')}
                </p>
                <div className={styles.draftBox}>
                  <textarea value={targetingAnalysis.engineV2.summary.generatedText} readOnly aria-label="Summary V2 generated candidate" />
                  <small>{uiLocale === 'zh' ? `方案 ${summaryVariant + 1}/3 · 每次「重新组合」切换确定性的表达策略；证据不变，不注入未验证信息。` : `Variant ${summaryVariant + 1}/3 · Recompose cycles deterministic phrasing strategies; evidence stays unchanged and no unverified information is introduced.`}</small>
                </div>
                <div className={styles.compactActions}>
                  <button type="button" className={styles.secondaryButton} onClick={handleRecomposeSummaryV2}>{uiLocale === 'zh' ? '重新组合 V2' : 'Recompose V2'}</button>
                  <button type="button" className={styles.primaryButton} onClick={handleApplySummaryV2}>{uiLocale === 'zh' ? '应用 V2 摘要' : 'Apply V2 Summary'}</button>
                </div>
              </>
            ) : (
              <p className={styles.emptyText}>{uiLocale === 'zh' ? '当前没有可生成的 V2 摘要候选。请确认个人职业资料库中存在摘要或可用的工作/项目证据。' : 'No V2 Summary candidate is currently available. Confirm that the Personal Career Library contains a Summary or usable Work/Project evidence.'}</p>
            )}
          </div>
          )}

          {targetingAnalysis && (
            <div className={styles.analysisBlock}>
              <label className={styles.targetingModeOption}>
                <input type="checkbox" checked={autoPageFill} onChange={(event) => { setAutoPageFill(event.target.checked); setTargetingApplied(false); applyRevisionRef.current = ''; finalSelectionSnapshotRef.current = null; convergenceGateRef.current = { revisionKey: '', corrections: 0 }; }} />
                <span><strong>{uiLocale === 'zh' ? '尽量填满目标页' : 'Fill Target Pages'}</strong><small>{uiLocale === 'zh' ? '按已冻结的推荐顺序，在目标页数内补充/压缩低优先级内容。' : 'Use the frozen recommendation order to add or compress lower-priority content within the target page count.'}</small></span>
              </label>
              <button type="button" className={styles.primaryButton} onClick={handleApplyTargeting}>{uiLocale === 'zh' ? (autoPageFill ? '应用推荐 + 尽量填满' : '应用最高推荐预选') : (autoPageFill ? 'Apply Recommendations + Fill Pages' : 'Apply Top Recommendations')}</button>
            </div>
          )}

          <section className={styles.advancedBlock} data-job-section="targeting">
            <details className={styles.applicationDetails}>
              <summary>{uiLocale === 'zh' ? '查看匹配详情' : 'View Match Details'}</summary>
              <div className={styles.advancedHeader}>
                <h3>{uiLocale === 'zh' ? '推荐引擎' : 'Targeting Engine'}</h3>
                <span>{targetingAnalysis ? `${targetingAnalysis.selectedRecommendationIds.length} Work/Project items suggested` : '—'}</span>
              </div>
            {targetingAnalysis ? (
              <>
                {layoutPressureDiagnosis && layoutPressureDiagnosis.severity !== 'none' && (
                  <div className={styles.analysisBlock}>
                    <h3>{layoutPressureDiagnosis.severity === 'near-fit' ? 'Near-fit Overflow' : 'Layout Pressure'}</h3>
                    <p className={styles.emptyText}>{layoutPressureDiagnosis.message}</p>
                    {layoutPressureDiagnosis.suggestions.length > 0 && (
                      <div className={styles.recommendationList}>
                        {layoutPressureDiagnosis.suggestions.map((item) => (
                          <div key={item.moduleId} className={styles.recommendationRow}>
                            <div><strong>{item.title}</strong><small>{item.reason}</small></div>
                            <span>~{item.estimatedSavings}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {pageLimit !== 'none' && (
                  <div className={styles.analysisBlock}>
                    <h3>{uiLocale === 'zh' ? '页面规划' : 'Page Plan'}</h3>
                    <p className={styles.emptyText}>
                      B4.4 候选 {targetingAnalysis.qualityRecommendationIds.length} 条 → B4.5 建议 {targetingAnalysis.selectedRecommendationIds.length} 条。
                      预计 Work/Project 占用 {targetingAnalysis.estimatedTargetingUsage.toFixed(1)} / {targetingAnalysis.estimatedTargetingCapacity?.toFixed(1) ?? '—'} units。
                      {targetingAnalysis.coreOverflow ? ' 核心证据本身超过可用预算，系统不会删除核心证据来伪造页数达标。' : ''}
                    </p>
                  </div>
                )}
                {pageLimit !== 'none' && (targetingContentSlots ?? 0) < 5.5 && (
                  <p className={styles.emptyText}>
                    ⚠ 当前目标页空间紧张。B4.5.1 会保留 Core / Strong Work-Project evidence、Education core 与 Compact Skills；未固定的低优先级 Training / Additional Experience / Additional Capabilities 可按整体页数预算逐级退出。Fixed 内容绝不会被自动取消。
                  </p>
                )}
                {Object.values(targetingLayoutPlan.sections).length > 0 && (
                  <div className={styles.analysisBlock}>
                    <h3>{uiLocale === 'zh' ? '技能布局辅助' : 'Skills Layout Assist'}</h3>
                    <p className={styles.emptyText}>{uiLocale === 'zh' ? '这里只显示布局建议，不会在应用推荐时改变你当前的技能布局。只有你手动修改布局选择器或勾选「紧凑短词」时，排版才会变化。' : 'Layout suggestions do not change the current Skills layout when recommendations are applied. Layout changes only when you manually change the selector or enable Compact Short Items.'}</p>
                    <div className={styles.recommendationList}>
                      {Object.values(targetingLayoutPlan.sections).map((item) => (
                        <div key={item.sectionId} className={styles.recommendationRow}>
                          <div><strong>{item.layout === 'list' ? '1×1' : item.layout.replace('grid-', '').replace('x', '×')}</strong><small>{uiLocale === 'zh' ? `${item.reason} 平衡度 ${item.balanceScore}%` : `Layout recommendation · balance ${item.balanceScore}%`}</small></div>
                          <span>{item.renderMode === 'inline-groups' ? 'COMPACT' : 'GRID'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className={styles.recommendationList}>
                  {topRecommendations.map((item) => (
                    <div key={item.moduleId} className={styles.recommendationRow}>
                      <div>
                        <strong>{item.userPriority ? '★ ' : ''}{item.title}</strong>
                        <small>{item.matchedRequirements.slice(0, 3).join(' · ') || 'Supporting content · no direct JD phrase match'}</small>
                      </div>
                      <span>{(targetingAnalysis?.recommendationTiers[item.moduleId] ?? 'filler').toUpperCase()} · {item.strongestEvidence.toUpperCase()}</span>
                    </div>
                  ))}
                </div>

                {similarContentGroups.length > 0 && (
                  <div className={styles.analysisBlock}>
                    <h3>{uiLocale === 'zh' ? '相似内容 · JD 排序' : 'Similar Content · JD Ranking'}</h3>
                    <p className={styles.emptyText}>{uiLocale === 'zh' ? '同一职位概念下存在多个描述/条目时，只按相关度给出排序建议。#1 是当前最相关候选；不会自动覆盖、改写或删除其他版本。' : 'When multiple bullets or entries map to the same JD concept, the system only ranks them by relevance. #1 is the most relevant current candidate; other versions are not overwritten, rewritten, or deleted.'}</p>
                    {similarContentGroups.map((group) => (
                      <div key={group.requirement} className={styles.recommendationList}>
                        <div className={styles.metricRow}><span>{group.requirement}</span><strong>{group.items.length} candidates</strong></div>
                        {group.items.map((item, index) => (
                          <div key={`${group.requirement}:${item.moduleId}`} className={styles.recommendationRow}>
                            <div>
                              <strong>{index === 0 ? '推荐 #1 · ' : `#${index + 1} · `}{item.title}</strong>
                              <small>{item.matchedRequirements.slice(0, 3).join(' · ')}</small>
                            </div>
                            <span>{item.score}%</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {partialJdEvidence.length > 0 && (
                  <div className={styles.analysisBlock}>
                    <h3>{uiLocale === 'zh' ? '部分 / 可迁移证据' : 'Partial / Transferable Evidence'}</h3>
                    <p className={styles.emptyText}>{uiLocale === 'zh' ? '找到可迁移或部分相关证据，但不足以当作直接经历。建议人工确认，不自动补充事实。' : 'Transferable or partially related evidence was found, but it is not sufficient as direct experience. Review manually; no facts are added automatically.'}</p>
                    <div className={styles.recommendationList}>
                      {partialJdEvidence.map((item) => (
                        <div key={item.id} className={styles.recommendationRow}>
                          <div><strong>{item.label}</strong><small>{item.sourceSnippets[0] ?? 'JD 中存在该要求。'}</small></div>
                          <span>?</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {missingJdEvidence.length > 0 && (
                  <div className={styles.analysisBlock}>
                    <h3>{uiLocale === 'zh' ? '缺失的 JD 证据' : 'Missing JD Evidence'}</h3>
                    <p className={styles.emptyText}>{uiLocale === 'zh' ? '现有简历中未找到明确证据。仅提示缺口，不自动编写或添加经历。' : 'No clear evidence was found in the current resume. The gap is flagged only; experience is not written or added automatically.'}</p>
                    <div className={styles.recommendationList}>
                      {missingJdEvidence.map((item) => (
                        <div key={item.id} className={styles.recommendationRow}>
                          <div><strong>{item.label}</strong><small>{uiLocale === 'zh' ? '请确认你是否真实具备相关经历，再决定是否补充。' : 'Confirm that you genuinely have the relevant experience before adding it.'}</small></div>
                          <span>!</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}




              </>
            ) : <p className={styles.emptyText}>{uiLocale === 'zh' ? '分析职位描述后显示条目级推荐。' : 'Analyze the Job Description to show entry-level recommendations.'}</p>}
            </details>
          </section>

          <section className={styles.advancedBlock} data-job-section="ats">
            <div className={styles.advancedHeader}><h3>{uiLocale === 'zh' ? 'ATS 安全检查' : 'ATS Safety Check'}</h3><span>{pdfIntegrity ? `${atsReport.score}/100 · ${atsReport.risk.toUpperCase()}` : `NOT RUN · ${atsReport.score}/100 heuristic`}</span></div>
            <p className={styles.emptyText}>{uiLocale === 'zh' ? '仅进行启发式文档安全检查；不保证一定通过任何 ATS。' : 'Heuristic document-safety check only; this is not an ATS pass guarantee.'}</p>
            <div className={styles.atsList}>
              {atsReport.checks.map((check) => <div key={check.id} className={styles.atsRow}><span>{check.severity === 'pass' ? '✓' : check.severity === 'fail' ? '×' : '!'}</span><div><strong>{check.label}</strong><small>{check.message}</small></div></div>)}
            </div>
            <button type="button" className={styles.secondaryButton} onClick={handleRunAtsIntegrity} disabled={atsChecking}>{atsChecking ? (uiLocale === 'zh' ? '检查中…' : 'Checking…') : (uiLocale === 'zh' ? '生成 PDF 并检查文本完整性' : 'Generate PDF & Check Text Integrity')}</button>
          </section>

          <section className={styles.advancedBlock} data-job-section="template">
            <div className={styles.advancedHeader}><h3>{uiLocale === 'zh' ? '模板引擎' : 'Template Engine'}</h3><span>{uiLocale === 'zh' ? `${templates.filter((template) => template.source === 'builtin').length} 个内置 · ${templates.filter((template) => template.source !== 'builtin').length} 个已保存` : `${templates.filter((template) => template.source === 'builtin').length} built-in · ${templates.filter((template) => template.source !== 'builtin').length} saved`}</span></div>
            <input ref={templateImportInputRef} type="file" accept=".json,.pdf" hidden onChange={handleTemplateImport} />
            <p className={styles.emptyText}>{uiLocale === 'zh' ? '内置模板已随 myC 提供，无需导入。导入模板仅用于你自己的 JSON/PDF 自定义模板。' : 'Built-in templates are included with myC and require no import. Template import is only for your own JSON/PDF custom templates.'}</p>
            <div className={styles.compactActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => templateImportInputRef.current?.click()}>{uiLocale === 'zh' ? '导入自定义模板' : 'Import Custom Template'}</button>
              <button type="button" className={styles.secondaryButton} onClick={handleSaveCurrentTemplate}>{uiLocale === 'zh' ? '保存当前格式' : 'Save Current Format'}</button>
            </div>
            {templates.some((template) => template.source === 'builtin') && <div className={styles.templateGroup}>
              <div className={styles.templateGroupHeader}><strong>{uiLocale === 'zh' ? '内置模板' : 'Built-in Templates'}</strong><small>{uiLocale === 'zh' ? '无需导入' : 'No import required'}</small></div>
              <div className={styles.templateList}>{templates.filter((template) => template.source === 'builtin').map((template) => { const localized = template.localized?.[uiLocale]; const displayName = localized?.name ?? template.name; const displayDescription = localized?.description ?? template.description; return <div key={template.id} className={`${styles.templateRow} ${activeTemplateId === template.id ? styles.templateRowActive : ''}`}><button type="button" className={styles.templateMainButton} onClick={() => handleApplyTemplate(template.id)} aria-pressed={activeTemplateId === template.id}><span className={styles.templateTitleLine}><strong>{displayName}</strong>{template.badge && <small className={styles.templateBadge}>{template.badge}</small>}{activeTemplateId === template.id && <small className={styles.templateActiveBadge}>{uiLocale === 'zh' ? '当前' : 'Active'}</small>}</span>{displayDescription && <small className={styles.templateDescription}>{displayDescription}</small>}</button></div>; })}</div>
            </div>}
            {templates.some((template) => template.source !== 'builtin') && <div className={styles.templateGroup}>
              <div className={styles.templateGroupHeader}><strong>{uiLocale === 'zh' ? '自定义模板' : 'Custom Templates'}</strong><small>{uiLocale === 'zh' ? '导入或保存' : 'Import or save'}</small></div>
              <div className={styles.templateList}>{templates.filter((template) => template.source !== 'builtin').map((template) => <div key={template.id} className={`${styles.templateRow} ${activeTemplateId === template.id ? styles.templateRowActive : ''}`}><button type="button" className={styles.templateMainButton} onClick={() => handleApplyTemplate(template.id)} aria-pressed={activeTemplateId === template.id}><span className={styles.templateTitleLine}><strong>{template.name}</strong>{template.badge && <small className={styles.templateBadge}>{template.badge}</small>}{activeTemplateId === template.id && <small className={styles.templateActiveBadge}>{uiLocale === 'zh' ? '当前' : 'Active'}</small>}</span>{template.description && <small className={styles.templateDescription}>{template.description}</small>}</button><button type="button" title={uiLocale === 'zh' ? '导出 JSON 模板' : 'Export JSON Template'} aria-label={uiLocale === 'zh' ? `导出模板 ${template.name}` : `Export template ${template.name}`} onClick={() => downloadTemplate(template)}>⇩</button></div>)}</div>
            </div>}
            {templateMessage && <p className={styles.emptyText}>{templateMessage}</p>}
          </section>

          <section className={styles.advancedBlock} data-job-section="cover">
            <div className={styles.advancedHeader}><h3>{uiLocale === 'zh' ? '职位申请' : 'Application'}</h3><span>{uiLocale === 'zh' ? '草稿与附件' : 'Draft & Attachments'}</span></div>
            <div className={styles.compactFields}>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company" aria-label="Application company"/>
              <input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="Role" aria-label="Application role"/>
            </div>
            {coverLetterPlan && applicationSummary ? <>
              <details className={styles.applicationDetails}>
                <summary>{uiLocale === 'zh' ? '匹配详情（可选）' : 'Match Details (optional)'}</summary>
                <div className={styles.focusList}>{applicationSummary.strongestEvidence.slice(0, 5).map((item) => <div key={item.requirement} className={styles.focusRow}><strong>{item.requirement}</strong><span>evidence</span><small>{item.evidence.join(' · ')}</small></div>)}</div>
                {(applicationSummary.partialEvidence.length > 0 || applicationSummary.missingEvidence.length > 0) && <div className={styles.applicationWarnings}>
                  {applicationSummary.partialEvidence.length > 0 && <p><strong>Yellow / transferable:</strong> {applicationSummary.partialEvidence.join(' · ')}</p>}
                  {applicationSummary.missingEvidence.length > 0 && <p><strong>Red / missing:</strong> {applicationSummary.missingEvidence.join(' · ')}</p>}
                </div>}
              </details>
              <details className={styles.applicationDetails}>
                <summary>{uiLocale === 'zh' ? '求职信辅助' : 'Cover Letter Assistant'}</summary>
                <div className={styles.applicationOptions}>
                  <label>Length<select value={coverLetterLength} onChange={(e) => setCoverLetterLength(e.target.value as CoverLetterLength)}><option value="short">Short</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select></label>
                </div>
                <div className={styles.focusList}>{coverLetterPlan.focus.slice(0, 5).map((item) => <div key={item.requirement} className={styles.focusRow}><strong>{item.requirement}</strong><span>{item.strength}</span><small>{item.evidence.map((e) => e.title).join(' · ') || (uiLocale === 'zh' ? '当前简历未找到支持证据；求职信将自动避开该项' : 'No supporting resume evidence was found; the Cover Letter will avoid this requirement')}</small></div>)}</div>
                <button type="button" className={styles.secondaryButton} onClick={handleGenerateCoverLetter}>{uiLocale === 'zh' ? '生成证据安全草稿' : 'Generate Evidence-safe Draft'}</button>
                {coverLetterDraft && <div className={styles.draftBox}><textarea value={coverLetterDraft} onChange={(e) => setCoverLetterDraft(e.target.value)} aria-label="Cover letter draft"/><small>{uiLocale === 'zh' ? '草稿可人工修改。系统不会把修改写回简历或匹配结果。' : 'The draft can be edited manually. Changes are not written back to the Resume or Targeting results.'}</small></div>}
              </details>
              <details className={styles.applicationDetails} open>
                <summary>{uiLocale === 'zh' ? '邮件 / 附件' : 'Email / Attachments'}</summary>
                <p className={styles.emptyText}>
                  {uiLocale === 'zh' ? 'HR 测试版不包含 Gmail 连接。可生成邮件内容并使用本机邮件客户端。' : 'Gmail connection is not included in the HR test build. You can generate the email content and open your local email client.'}
                </p>
                <div className={styles.compactFields}>
                  <input value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} placeholder="Recipient email (auto-detected from JD)" aria-label="Application email recipient"/>
                  <input value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder="CC (optional, comma or semicolon separated)" aria-label="Application email cc"/>
                </div>
                <input value={emailDraftPlan?.subject ?? ''} readOnly placeholder="Subject" aria-label="Application email subject"/>
                {inferredEmail && <p className={styles.emptyText}>{uiLocale === 'zh' ? `职位描述检测到目标邮箱：${inferredEmail}。收件人可人工修改；人工修改后不会被自动覆盖。` : `Application email detected from the JD: ${inferredEmail}. The recipient can be edited manually and manual edits will not be overwritten.`}</p>}
                <div className={styles.applicationOptions}>
                  <label><input type="checkbox" checked={includeResumeAttachment} onChange={(e) => setIncludeResumeAttachment(e.target.checked)}/> Resume PDF</label>
                  <label><input type="checkbox" checked={includeCoverLetterAttachment} onChange={(e) => setIncludeCoverLetterAttachment(e.target.checked)}/> Cover Letter</label>
                </div>
                {emailDraftPlan && <div className={styles.draftBox}>
                  <textarea value={emailBodyEdited ? emailBodyDraft : emailDraftPlan.body} onChange={(e) => { setEmailBodyDraft(e.target.value); setEmailBodyEdited(true); }} aria-label="Application email body"/>
                  <small>{uiLocale === 'zh' ? '简短申请说明正文最多 50 个英文单词；感谢语与姓名 / 邮箱 / 电话签名自动附在下方。正文可人工修改。' : 'The short cover note is limited to 50 words; the thank-you line and name / email / phone signature are appended automatically. The body can be edited manually.'}</small><button type="button" className={styles.secondaryButton} onClick={handleResetEmailBody}>{uiLocale === 'zh' ? '重新生成短邮件' : 'Regenerate Short Email'}</button>
                </div>}
                <div className={styles.applicationOptions}>
                  <button type="button" className={styles.secondaryButton} onClick={handleOpenEmailClient} disabled={!emailRecipient.trim()}>{uiLocale === 'zh' ? '打开本机邮件客户端' : 'Open Local Email Client'}</button>
                  <button type="button" className={styles.secondaryButton} onClick={handleCreateConnectedDraft} disabled>{uiLocale === 'zh' ? 'Gmail 草稿：HR 测试版未启用' : 'Gmail Draft: Not enabled in HR test build'}</button>

                </div>
                {mailMessage && <p className={styles.emptyText}>{mailMessage}</p>}

              </details>
              <details className={styles.applicationDetails}>
                <summary>{uiLocale === 'zh' ? '申请备注 / 材料包' : 'Application Notes / Package'}</summary>
                <textarea className={styles.applicationNotes} value={applicationNotes} onChange={(e) => setApplicationNotes(e.target.value)} placeholder={uiLocale === 'zh' ? '记录申请日期、联系人、特殊要求或后续事项…' : 'Record application date, contact, special requirements, or follow-up notes…'} aria-label="Application notes"/>
                <div className={styles.applicationChecklist}>{applicationSummary.checklist.map((item) => <div key={item.label}><span>{item.status === 'ready' ? '✓' : '!'}</span><span>{item.label}</span></div>)}</div>
                <button type="button" className={styles.secondaryButton} onClick={handleDownloadApplicationRecord}>{uiLocale === 'zh' ? '导出申请记录 (.json)' : 'Export Application Record (.json)'}</button>
                <p className={styles.emptyText}>{uiLocale === 'zh' ? '简历 PDF 继续使用上方导出；申请记录只保存职位描述、摘要、求职信与备注，不重新生成简历。' : 'Use the Export action above for the Resume PDF. The Application Record stores the JD, summary, Cover Letter, and notes without regenerating the Resume.'}</p>
              </details>
            </> : <p className={styles.emptyText}>{uiLocale === 'zh' ? '完成职位匹配后生成投递摘要、证据安全的求职信草稿与申请记录。' : 'Complete Targeting to generate an application summary, evidence-safe Cover Letter draft, and Application Record.'}</p>}
          </section>
          </div>
        </aside>
      </div>

      <footer className={styles.bottomBar}>
        <div className={styles.desktopControls}>
          <DraftStatus
            locale={uiLocale}
            isSaving={isSavingDraft}
            lastSavedLabel={lastSavedAt ? lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (uiLocale === 'zh' ? '未保存' : 'Not saved')}
            onSaveNow={saveDraftNow}
          />
          <span className={styles.footerMeta}>
            {uiLocale === 'zh' ? 'PDF：' : 'PDF: '}
            {pdfRendering
              ? ui.rendering
              : pdfSynced
                ? `${ui.pdfSynced}${pdfLastGeneratedAt ? ` · ${pdfLastGeneratedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
                : pdfUrl
                  ? ui.pdfDirty
                  : ui.pdfNotGenerated}
          </span>
          <span className={styles.footerMeta}>
            {uiLocale === 'zh' ? '页数' : 'Pages'} {authoritativePageCount} / {pageLimit === 'none' ? '∞' : pageLimit}
          </span>
          <span className={styles.footerMeta}>
            {uiLocale === 'zh' ? '当前页使用率' : 'Current page usage'} {previewUsagePercent}%
          </span>
          <span
            className={`${styles.pageFitBadge} ${styles[`pageFit_${pageFitStatus}`]}`}
          >
            {pageFitLabel}
          </span>
          <button type="button" className={styles.secondaryButton} onClick={() => setPageSettingsOpen(true)}>{ui.pageSettings}</button>
          <button type="button" className={styles.primaryButton} onClick={handleExportPdf}>{ui.exportPdf}</button>
        </div>

        <nav className={styles.mobileNav} aria-label={uiLocale === 'zh' ? '移动端工作区导航' : 'Mobile workspace navigation'}>
          <button type="button" className={`${styles.mobileNavButton} ${mobilePane === 'preview' ? styles.mobileNavButtonActive : ''}`} onPointerUp={() => handleMobilePaneChange('preview')}>{uiLocale === 'zh' ? '预览' : 'Preview'}</button>
          <button type="button" className={`${styles.mobileNavButton} ${mobilePane === 'modules' ? styles.mobileNavButtonActive : ''}`} onPointerUp={() => handleMobilePaneChange('modules')}>{uiLocale === 'zh' ? '模块' : 'Modules'}</button>
          <button type="button" className={`${styles.mobileNavButton} ${mobilePane === 'job' ? styles.mobileNavButtonActive : ''}`} onPointerUp={() => handleMobilePaneChange('job')}>{uiLocale === 'zh' ? '职位' : 'Job'}</button>
          <button type="button" className={styles.mobileNavButton} onPointerUp={() => setPageSettingsOpen(true)}>{uiLocale === 'zh' ? '设置' : 'Settings'}</button>
          <button type="button" className={`${styles.mobileNavButton} ${styles.mobileExportButton}`} onPointerUp={() => { void handleExportPdf(); }}>{uiLocale === 'zh' ? '导出' : 'Export'}</button>
        </nav>
      </footer>


      <DeletedModulesPanel
        locale={uiLocale}
        open={deletedPanelOpen}
        items={deletedModules}
        onClose={() => setDeletedPanelOpen(false)}
        onRestore={restoreDeletedModule}
        onDeleteForever={deleteModuleForever}
      />

      <PageSettingsPanel
        locale={uiLocale}
        open={pageSettingsOpen}
        value={pageSettings}
        defaultShortWordLayout={defaultShortWordLayout}
        templates={templates}
        onChange={updatePageSettings}
        onTemplateSelect={handleApplyTemplate}
        onShortWordLayoutChange={setDefaultShortWordLayout}
        mailConnection={mailConnection}
        mailConnectionLoading={mailConnectionLoading}
        mailMessage={mailMessage}
        onDisconnectMail={handleDisconnectMail}
        onClose={() => setPageSettingsOpen(false)}
      />
    </main>
    </>
  );
}
