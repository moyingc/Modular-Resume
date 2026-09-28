import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';

import type { ResumeDocument, ResumeModule } from '../core/resume/types';
import { candidateNameOf } from '../core/resume/fileName';
import { canPackSkillInHalfRow, parseAlignedResumeLine } from '../core/resume/renderLayout';
import type { PageSettings, SectionLayoutMode } from '../types/editor-ui.types';
import { resolvePdfFontFamily, resumeNeedsCjkFont } from './pdfFonts';

type Props = {
  resume: ResumeDocument;
  settings: PageSettings;
  sectionLayouts: Record<string, SectionLayoutMode>;
};

function pointsForMargin(preset: PageSettings['marginPreset']) {
  switch (preset) {
    case 'compact':
      return { vertical: 30, horizontal: 36 };
    case 'wide':
      return { vertical: 46, horizontal: 50 };
    case 'standard':
    default:
      return { vertical: 36, horizontal: 40 };
  }
}

function lineHeightForDensity(density: PageSettings['density']) {
  switch (density) {
    case 'compact':
      return 1.12;
    case 'relaxed':
      return 1.30;
    case 'standard':
    default:
      return 1.18;
  }
}

function columnCount(layout: SectionLayoutMode) {
  if (layout === 'grid-3x3') return 3;
  if (layout === 'row-first-2col' || layout === 'grid-2x2' || layout === 'grid-2x3') return 2;
  return 1;
}

function selectedChildren(module: ResumeModule) {
  return (module.children ?? []).filter((child) => child.selected);
}

function isMarkdownSeparator(value: string) {
  return /^(?:-{3,}|\*{3,}|_{3,})$/.test(value.trim().replace(/\s+/g, ''));
}

function renderedText(module: ResumeModule) {
  const value = module.useCompactContent && module.compactContent?.trim()
    ? module.compactContent.trim()
    : (module.content ?? module.title);
  return isMarkdownSeparator(value) ? '' : value;
}

function hasRenderableContent(module: ResumeModule): boolean {
  if (!module.selected) return false;
  if (module.kind === 'bullet') return Boolean(renderedText(module).trim());
  if (module.kind === 'skill') return Boolean(module.title.trim());

  // IMPORTANT: distinguish between a true leaf entry and an entry that owns
  // children but currently has none selected. The latter must not fall back to
  // rendering only its title/subtitle.
  if ((module.children?.length ?? 0) > 0) {
    return module.children!.some((child) => child.selected && hasRenderableContent(child));
  }

  // True leaf entries such as Education/Training records remain renderable.
  if (module.kind === 'entry') return Boolean(module.title.trim() || module.subtitle?.trim() || module.content?.trim());
  return Boolean((module.content ?? '').trim());
}



export default function ResumePdfDocument({
  resume,
  settings,
  sectionLayouts,
}: Props) {
  const needsCjk = resumeNeedsCjkFont(resume);
  const family = resolvePdfFontFamily(settings.fontFamily, needsCjk);
  const margin = pointsForMargin(settings.marginPreset);
  const bodySize = settings.bodyFontSize;
  const lineHeight = lineHeightForDensity(settings.density);

  const styles = StyleSheet.create({
    page: {
      paddingTop: margin.vertical,
      paddingBottom: margin.vertical,
      paddingLeft: margin.horizontal,
      paddingRight: margin.horizontal,
      fontFamily: family,
      fontSize: bodySize,
      lineHeight,
      color: '#111111',
      backgroundColor: '#ffffff',
    },
    header: {
      textAlign: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#111111',
      paddingBottom: 4,
      marginBottom: 6,
    },
    name: {
      fontSize: bodySize * 1.72,
      fontWeight: 700,
      lineHeight: 1,
      marginBottom: 3,
    },
    contact: {
      fontSize: Math.max(7.5, bodySize * 0.82),
      lineHeight: 1.15,
    },
    section: {
      marginTop: 6,
    },
    sectionTitle: {
      fontSize: bodySize * 1.08,
      fontWeight: 700,
      lineHeight: 1.1,
      borderBottomWidth: 0.7,
      borderBottomColor: '#222222',
      paddingBottom: 2,
      marginBottom: 4,
    },
    entry: {
      marginBottom: 4.5,
    },
    entryTitle: {
      fontSize: bodySize,
      fontWeight: 700,
      lineHeight: 1.15,
    },
    subtitle: {
      fontSize: Math.max(7.5, bodySize * 0.9),
      color: '#333333',
      lineHeight: 1.15,
      marginTop: 1,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: 0.8,
      paddingLeft: 9,
    },
    bulletMark: {
      width: 8,
      fontSize: bodySize * 0.86,
    },
    bulletText: {
      flex: 1,
      fontSize: bodySize,
      lineHeight,
    },
    directText: {
      fontSize: bodySize,
      lineHeight,
      marginBottom: 1.5,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    gridItem: {
      paddingRight: 10,
      marginBottom: 1.5,
    },
    skill: {
      fontSize: bodySize,
      lineHeight,
    },
    entryHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    entryHeadingLeft: { flexGrow: 1, flexShrink: 1, paddingRight: 8 },
    entryHeadingRight: { flexShrink: 0, textAlign: 'right' },
    compactSkillGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingLeft: 9, marginTop: 0.8 },
    compactSkillItem: { width: '50%', flexDirection: 'row', paddingRight: 6, marginBottom: 0.8 },
    compactSkillText: { flex: 1, fontSize: bodySize, lineHeight },
    compactSkillPairRow: { flexDirection: 'row', paddingLeft: 9, marginBottom: 0.8 },
    compactSkillFullRow: { flexDirection: 'row', paddingLeft: 9, marginBottom: 0.8 },
    compactSkillHalf: { width: '50%', flexDirection: 'row', paddingRight: 6 },
  });


  const pageContentWidthPt = 595.28 - margin.horizontal * 2;


  const renderEntry = (entry: ResumeModule, widthPercent: number, allowWrap = false) => (
    <View
      key={entry.id}
      style={[
        styles.entry,
        widthPercent < 100
          ? { width: `${widthPercent}%`, paddingRight: 9 }
          : undefined,
      ]}
      wrap={allowWrap}
    >
      {(() => {
        const aligned = parseAlignedResumeLine(entry.title);
        return aligned ? (
          <View style={styles.entryHeadingRow}>
            <Text style={[styles.entryTitle, styles.entryHeadingLeft]}>{aligned.left}</Text>
            <Text style={[styles.entryTitle, styles.entryHeadingRight]}>{aligned.right}</Text>
          </View>
        ) : <Text style={styles.entryTitle}>{entry.title}</Text>;
      })()}
      {entry.subtitle ? (() => {
        const aligned = parseAlignedResumeLine(entry.subtitle);
        return aligned ? (
          <View style={styles.entryHeadingRow}>
            <Text style={[styles.subtitle, styles.entryHeadingLeft]}>{aligned.left}</Text>
            <Text style={[styles.subtitle, styles.entryHeadingRight]}>{aligned.right}</Text>
          </View>
        ) : <Text style={styles.subtitle}>{entry.subtitle}</Text>;
      })() : null}

      {entry.compactShortSkills && selectedChildren(entry).filter((child) => child.kind === 'skill').length >= 2 ? (
        <>
          {(() => {
            const items = selectedChildren(entry);
            const rows: ResumeModule[][] = [];
            const availableEntryWidthPt = pageContentWidthPt * (widthPercent / 100);
            for (let index = 0; index < items.length; index += 1) {
              const current = items[index];
              const next = items[index + 1];
              const canPair = current.kind === 'skill'
                && next?.kind === 'skill'
                && canPackSkillInHalfRow(renderedText(current), availableEntryWidthPt, bodySize)
                && canPackSkillInHalfRow(renderedText(next), availableEntryWidthPt, bodySize);
              if (canPair && next) {
                rows.push([current, next]);
                index += 1;
              } else {
                rows.push([current]);
              }
            }
            return rows.map((row, rowIndex) => row.length === 2 ? (
              <View key={`${entry.id}-compact-row-${rowIndex}`} style={styles.compactSkillPairRow} wrap={false}>
                {row.map((child) => <View key={child.id} style={styles.compactSkillHalf}><Text style={styles.bulletMark}>•</Text><Text style={styles.compactSkillText}>{renderedText(child)}</Text></View>)}
              </View>
            ) : (
              <View key={`${entry.id}-compact-row-${rowIndex}`} style={styles.compactSkillFullRow} wrap={false}>
                <Text style={styles.bulletMark}>•</Text><Text style={styles.bulletText}>{renderedText(row[0])}</Text>
              </View>
            ));
          })()}
        </>
      ) : selectedChildren(entry).map((child) => {
        const text = renderedText(child);
        return (
          <View key={child.id} style={styles.bulletRow} wrap={false}>
            <Text style={styles.bulletMark}>•</Text>
            <Text style={styles.bulletText}>{text}</Text>
          </View>
        );
      })}
    </View>
  );

  const renderSection = (section: ResumeModule) => {
    const layout = sectionLayouts[section.id] ?? 'list';
    const isSkillSection = /(skill|technical skills|core competencies|技能|专业技能)/i.test(section.title);
    const columns = columnCount(layout);
    const widthPercent = 100 / columns;
    const children = selectedChildren(section).filter(hasRenderableContent);
    if (!children.length) return null;

    if (layout === 'row-first-2col') {
      const pairedCount = children.length - (children.length % 2);
      const pairs: Array<[ResumeModule, ResumeModule]> = [];
      for (let index = 0; index < pairedCount; index += 2) {
        pairs.push([children[index], children[index + 1]]);
      }
      const odd = children.length % 2 ? children[children.length - 1] : null;
      const renderSkillCategory = (child: ResumeModule) =>
        child.kind === 'entry'
          ? renderEntry(child, 100, isSkillSection)
          : <Text key={child.id} style={styles.directText}>{renderedText(child)}</Text>;

      return (
        <View key={section.id} style={styles.section}>
          <Text style={styles.sectionTitle} minPresenceAhead={26}>{section.title}</Text>
          {pairs.map(([left, right], index) => (
            <View key={`${section.id}:row:${index}`} style={styles.grid}>
              <View style={{ width: '50%', paddingRight: 9 }}>{renderSkillCategory(left)}</View>
              <View style={{ width: '50%' }}>{renderSkillCategory(right)}</View>
            </View>
          ))}
          {odd && (
            <View style={{ width: '100%' }}>
              {renderSkillCategory(odd)}
            </View>
          )}
        </View>
      );
    }

    return (
      <View key={section.id} style={styles.section}>
        <Text style={styles.sectionTitle} minPresenceAhead={26}>
          {section.title}
        </Text>

        <View style={columns > 1 ? styles.grid : undefined}>
          {children.map((child) => {
            if (child.kind === 'skill') {
              return (
                <View
                  key={child.id}
                  style={[
                    styles.gridItem,
                    columns > 1 ? { width: `${widthPercent}%` } : { width: '100%' },
                  ]}
                  wrap={false}
                >
                  <Text style={styles.skill}>{child.title}</Text>
                </View>
              );
            }

            if (child.kind === 'bullet') {
              return (
                <View
                  key={child.id}
                  style={[
                    styles.gridItem,
                    columns > 1 ? { width: `${widthPercent}%` } : { width: '100%' },
                  ]}
                  wrap={false}
                >
                  <Text style={styles.directText}>{renderedText(child)}</Text>
                </View>
              );
            }

            return renderEntry(child, columns > 1 ? widthPercent : 100, isSkillSection);
          })}
        </View>
      </View>
    );
  };

  return (
    <Document
      title={`${candidateNameOf(resume)} Resume`}
      author={resume.name}
      subject="Resume"
      creator="myC"
    >
      <Page
        size={settings.paperSize === 'a4' ? 'A4' : 'LETTER'}
        style={styles.page}
        wrap
      >
        <View style={styles.header} fixed={false}>
          <Text style={styles.name}>{resume.name}</Text>
          <Text style={styles.contact}>{resume.contactLine}</Text>
        </View>

        {resume.sections
          .filter((section) => section.selected && hasRenderableContent(section))
          .map(renderSection)}
      </Page>
    </Document>
  );
}
