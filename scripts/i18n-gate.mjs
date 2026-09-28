import fs from 'node:fs';
const files = ['src/workbench/ModularResumeWorkbench.tsx','src/renderer/ResumeRenderer.tsx','src/pdf/PdfPreview.tsx','src/modules/SectionLayoutSelector.tsx'];
let failures=[];
for (const file of files) {
  const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
  lines.forEach((line,i)=>{
    if (/[\u4e00-\u9fff]/.test(line) && !line.includes("locale === 'zh'") && !line.includes("uiLocale === 'zh'") && !line.includes('UI_MESSAGES') && !line.includes('labelEn')) failures.push(`${file}:${i+1} unguarded CJK UI text`);
  });
}
const work=fs.readFileSync('src/workbench/ModularResumeWorkbench.tsx','utf8');
for (const required of ["'职位描述' : 'Job Description'","'求职信' : 'Cover Letter'","'模板' : 'Template'","'职业摘要 V2' : 'Professional Summary V2'","'职位申请' : 'Application'"]) if(!work.includes(required)) failures.push(`missing locale pair ${required}`);
const selector=fs.readFileSync('src/modules/SectionLayoutSelector.tsx','utf8');
if(!selector.includes('locale?: UiLocale')) failures.push('SectionLayoutSelector missing locale prop');
if(failures.length){ console.error(failures.join('\n')); process.exit(1); }
console.log('i18n gate PASS');
console.log('- primary UI has no unguarded Chinese literals');
console.log('- key Chinese/English UI pairs present');
console.log('- SectionLayoutSelector accepts UiLocale');
