import type { ResumeDocument } from '../core/resume/types';

export const mockResume: ResumeDocument = {
  id: 'resume-demo',
  name: '张明',
  contactLine: 'Winnipeg, MB · example@email.com · 204-000-0000 · linkedin.com/in/example',
  sections: [
    {
      id: 'summary',
      kind: 'section',
      title: '职业概述',
      selected: true,
      locked: true,
      children: [
        {
          id: 'summary-1',
          kind: 'bullet',
          title: '概述内容',
          content: '具备工程分析、数据处理与跨团队协作经验，能够将复杂问题拆解为可执行方案。',
          selected: true,
          relevance: 82,
        },
      ],
    },
    {
      id: 'education',
      kind: 'section',
      title: '教育经历',
      selected: true,
      children: [
        {
          id: 'education-1',
          kind: 'entry',
          title: 'University of Manitoba',
          subtitle: 'Bachelor of Science · Computer Engineering',
          selected: true,
          relevance: 71,
          children: [
            {
              id: 'education-1-b1',
              kind: 'bullet',
              title: '毕业时间',
              content: 'Expected Graduation: May 2027',
              selected: true,
            },
          ],
        },
      ],
    },
    {
      id: 'experience',
      kind: 'section',
      title: '工作经历',
      selected: true,
      children: [
        {
          id: 'experience-1',
          kind: 'entry',
          title: 'Engineering Intern',
          subtitle: 'Example Company · Winnipeg, MB',
          selected: true,
          relevance: 88,
          children: [
            {
              id: 'experience-1-b1',
              kind: 'bullet',
              title: 'Bullet 1',
              content: '使用 Python 处理工程数据并建立验证流程，减少重复检查工作。',
              selected: true,
              relevance: 94,
            },
            {
              id: 'experience-1-b2',
              kind: 'bullet',
              title: 'Bullet 2',
              content: '参与系统测试、故障排查与技术文档整理，并与不同团队协调问题闭环。',
              selected: true,
              relevance: 86,
            },
            {
              id: 'experience-1-b3',
              kind: 'bullet',
              title: 'Bullet 3',
              content: '维护周度记录和内部流程文档。',
              selected: false,
              relevance: 36,
            },
          ],
        },
      ],
    },
    {
      id: 'projects',
      kind: 'section',
      title: '项目经历',
      selected: true,
      children: [
        {
          id: 'project-1',
          kind: 'entry',
          title: 'Automation & Data Project',
          subtitle: 'Personal Project',
          selected: true,
          relevance: 84,
          children: [
            {
              id: 'project-1-b1',
              kind: 'bullet',
              title: 'Bullet 1',
              content: '设计模块化数据流程，将输入、筛选、排序和输出职责分离。',
              selected: true,
              relevance: 90,
            },
            {
              id: 'project-1-b2',
              kind: 'bullet',
              title: 'Bullet 2',
              content: '建立可解释的规则系统，用于比较不同内容与目标需求的相关性。',
              selected: true,
              relevance: 78,
            },
          ],
        },
      ],
    },
    {
      id: 'skills',
      kind: 'section',
      title: '技能',
      selected: true,
      children: [
        { id: 'skill-python', kind: 'skill', title: 'Python', selected: true, relevance: 95 },
        { id: 'skill-cpp', kind: 'skill', title: 'C++', selected: true, relevance: 74 },
        { id: 'skill-testing', kind: 'skill', title: 'Testing', selected: true, relevance: 89 },
        { id: 'skill-analysis', kind: 'skill', title: 'Data Analysis', selected: true, relevance: 91 },
        { id: 'skill-matlab', kind: 'skill', title: 'MATLAB', selected: false, relevance: 42 },
      ],
    },
    {
      id: 'certifications',
      kind: 'section',
      title: '证书',
      selected: false,
      children: [
        { id: 'cert-1', kind: 'entry', title: '示例证书', selected: false, relevance: 28 },
      ],
    },
  ],
};
