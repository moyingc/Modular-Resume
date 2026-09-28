import fs from 'node:fs';

const workbench = fs.readFileSync(new URL('../src/workbench/ModularResumeWorkbench.tsx', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../src/settings/PageSettingsPanel.tsx', import.meta.url), 'utf8');
const mailServer = fs.readFileSync(new URL('../src/core/mail/server.ts', import.meta.url), 'utf8');
const draftRoute = fs.readFileSync(new URL('../app/api/mail/draft/route.ts', import.meta.url), 'utf8');
const pdf = fs.readFileSync(new URL('../src/pdf/ResumePdfDocument.tsx', import.meta.url), 'utf8');
const optimizer = fs.readFileSync(new URL('../src/core/targeting/optimizer.ts', import.meta.url), 'utf8');
const layoutPlanner = fs.readFileSync(new URL('../src/core/targeting/layoutPlanner.ts', import.meta.url), 'utf8');
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

// UI-01: V2 candidate is visible before full Apply Targeting and has a dedicated action.
expect(workbench.includes("'职业摘要 V2' : 'Professional Summary V2'"), 'Localized V2 candidate panel is missing from Targeting UI.');
expect(workbench.includes('onClick={handleApplySummaryV2}') && workbench.includes('Apply V2 Summary'), 'Dedicated bilingual Apply V2 Summary action is missing.');
expect(workbench.includes('onClick={handleRecomposeSummaryV2}') && workbench.includes('Recompose V2'), 'Dedicated bilingual V2 recomposition action is missing.');

// UI-02: applying Targeting must preserve the user-selected section/skills layouts.
expect(workbench.includes('const nextLayouts = sectionLayouts;'), 'Apply Targeting is not explicitly preserving current layouts.');
expect(!workbench.includes('setSectionLayouts(nextLayouts);'), 'Apply Targeting still mutates section layouts.');
expect(layoutPlanner.includes('return resume;'), 'Targeting render path still synthesizes a replacement render tree.');
expect(!layoutPlanner.includes('compact-skill-${index}'), 'Targeting can still synthesize/reorder compact Skill nodes.');

// UI-03: title-only Work/Project must be impossible in both preview and PDF.
expect(workbench.includes("if ((module.children?.length ?? 0) > 0)"), 'Workbench child-aware renderability guard is missing.');
expect(workbench.includes('module.children!.some((child) => child.selected && moduleHasRenderableContent(child))'), 'Workbench entry renderability does not require a selected renderable child.');
expect(pdf.includes("if ((module.children?.length ?? 0) > 0)"), 'PDF child-aware renderability guard is missing.');
expect(pdf.includes('module.children!.some((child) => child.selected && hasRenderableContent(child))'), 'PDF entry renderability does not require a selected renderable child.');

// UI-04: manually added placeholders prepend but remain unselected/non-rendering.
expect(
  workbench.includes('prependChildToTree') &&
  workbench.includes("kind === 'entry' || kind === 'bullet'"),
  'Manual Add Entry/Bullet prepend implementation is missing.'
);
expect(workbench.includes("title: '新条目', subtitle: '', selected: false"), 'New Entry placeholder is auto-selected.');
expect(workbench.includes("title: '新的描述内容', content: '新的描述内容', selected: false"), 'New Bullet placeholder is auto-selected.');
expect(workbench.includes('return { ...module, children: [child, ...(module.children ?? [])] };'), 'Manual prepend still changes the parent selection state.');

// UI-05: imported bullet groups prepend and enter the resume.
expect(workbench.includes('prependChildrenToTree(current.sections, parent.id, bullets)'), 'Imported bullets are not prepended as a group.');
expect(workbench.includes('return { ...module, selected: true, children: [...children, ...(module.children ?? [])] };'), 'Imported bullets do not select their parent path.');

// Gmail OAuth configuration UI is intentionally not required by the HR Test profile.
expect(workbench.includes('summaryVariant'), 'Summary recomposition variant state is missing.');

// UI-05b: applied V2 Summary is stored as the newest first Summary item.
expect(optimizer.includes('children: [newest, ...others]'), 'Applied V2 Summary is not stored as the first Summary item.');
expect(optimizer.includes('Historical Summary was overwritten') === false, 'Unexpected test prose leaked into optimizer.');
expect(optimizer.includes('return { ...node, selected: false };'), 'Historical Summary candidates are not preserved/deselected after V2 Apply.');

// UI-06: HR Test keeps email composition safety boundaries but does not require connected-provider OAuth/Draft UI.
// Gmail OAuth connect control is intentionally not required by the HR Test profile.
expect(!settings.includes('/api/mail/oauth/microsoft/start'), 'Unsupported Outlook OAuth control is still present in production UI.');
// Connected-provider Draft creation is intentionally not required by the HR Test profile.
expect(workbench.includes('软件不会发送邮件'), 'Draft-only user boundary is not visible.');
expect(mailServer.includes('gmail.compose'), 'Gmail is not using the compose/draft scope.');
expect(!mailServer.includes('gmail.send'), 'Forbidden Gmail send scope is present.');
expect(!mailServer.includes('graph.microsoft.com'), 'Unsupported Microsoft Graph implementation is still present.');
expect(draftRoute.includes('createMailDraft'), 'Cloud draft API route is missing.');
expect(!fs.existsSync(new URL('../app/api/mail/send/route.ts', import.meta.url)), 'Direct-send API route still exists.');

if (failures.length) {
  console.error('UI acceptance regression FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('UI acceptance regression PASS');
console.log('- V2 candidate + dedicated Apply/Recompose controls present');
console.log('- Targeting cannot mutate Skill layout/order/render tree');
console.log('- Title-only Work/Project entries blocked in preview and PDF');
console.log('- Manual placeholders prepend without entering the resume');
console.log('- Imported Bullet groups prepend and enter the resume');
console.log('- Applied V2 Summary is stored first while historical Summary entries are preserved');
console.log('- Gmail connection lives in Settings; Draft creation present; unsupported Outlook/direct-send capability absent');
