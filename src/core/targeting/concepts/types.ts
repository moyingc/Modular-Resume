import type { RequirementCategory } from '../types';

export type Concept = {
  id: string;
  label: string;
  category: RequirementCategory;
  patterns: string[];
  supporting?: string[];
};


export type ConceptPack = { id: string; label: string; concepts: Concept[] };
