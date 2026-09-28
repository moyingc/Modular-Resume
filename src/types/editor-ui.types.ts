export type SectionLayoutMode = 'list' | 'row-first-2col' | 'grid-2x2' | 'grid-2x3' | 'grid-3x3';

export interface PageSettings {
  paperSize: 'a4' | 'letter';
  templateId: string;
  fontFamily: 'Arial' | 'Georgia' | 'Times New Roman' | 'Helvetica';
  bodyFontSize: number;
  density: 'compact' | 'standard' | 'relaxed';
  marginPreset: 'compact' | 'standard' | 'wide';
  targetPages: '1' | '2' | 'none';
  exportFileName: string;
}

export interface DraftStatusValue {
  isSaving: boolean;
  lastSavedLabel: string;
}

export interface DeletedModuleItem<TModule = unknown> {
  id: string;
  module: TModule;
  parentId: string | null;
  index: number;
  deletedAt: string;
  expiresAt: string;
}
