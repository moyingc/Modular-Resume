import { CORE_CONCEPTS } from './core';
import type { Concept, ConceptPack } from './types';
import { SOFTWARE_CS_PACK, COMPUTER_ENGINEERING_PACK, ELECTRICAL_ENGINEERING_PACK, MECHANICAL_ENGINEERING_PACK, BIOMEDICAL_ENGINEERING_PACK, CIVIL_ENGINEERING_PACK, INDUSTRIAL_ENGINEERING_PACK, CHEMICAL_ENGINEERING_PACK } from './engineering';

export const DOMAIN_PACKS = [
  SOFTWARE_CS_PACK, COMPUTER_ENGINEERING_PACK, ELECTRICAL_ENGINEERING_PACK,
  MECHANICAL_ENGINEERING_PACK, BIOMEDICAL_ENGINEERING_PACK, CIVIL_ENGINEERING_PACK,
  INDUSTRIAL_ENGINEERING_PACK, CHEMICAL_ENGINEERING_PACK,
] as const;

export type ConceptPackId = (typeof DOMAIN_PACKS)[number]['id'];
export const CONCEPT_PACK_OPTIONS = DOMAIN_PACKS.map(({id,label}) => ({id,label}));

const byId = new Map<string, ConceptPack>(DOMAIN_PACKS.map(pack => [pack.id, pack]));

/** Core concepts are always active. Domain packs are additive. Until the UI exposes
 * profession selection, omitting packIds preserves broad matching by enabling all packs. */
export function getActiveConcepts(packIds?: readonly ConceptPackId[]): Concept[] {
  const selected = packIds === undefined ? DOMAIN_PACKS : packIds.map(id => byId.get(id)).filter((x): x is ConceptPack => Boolean(x));
  const merged = [...CORE_CONCEPTS, ...selected.flatMap(pack => pack.concepts)];
  const seen = new Set<string>();
  return merged.filter(c => !seen.has(c.id) && seen.add(c.id));
}

export type { Concept, ConceptPack } from './types';
