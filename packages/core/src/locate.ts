import type { Factory } from '@one-twin/schema';
import { FACTORY_COLLECTIONS, type FactoryCollection } from '@one-twin/schema';

type Entity = { id: string } & Record<string, unknown>;

/** The array behind a collection path ("building.walls", "nav.paths", "machines" …). */
export function collection(doc: Factory, path: FactoryCollection): Entity[] {
  let v: unknown = doc;
  for (const k of path.split('.')) v = (v as Record<string, unknown>)[k];
  return v as Entity[];
}

/** Find an object by id in any collection of a factory document. */
export function locate(doc: Factory, id: string): { path: FactoryCollection; list: Entity[]; index: number; item: Entity } | null {
  for (const path of FACTORY_COLLECTIONS) {
    const list = collection(doc, path), index = list.findIndex(e => e.id === id);
    if (index >= 0) return { path, list, index, item: list[index]! };
  }
  return null;
}

export function allIds(doc: Factory): Set<string> {
  const s = new Set<string>();
  for (const path of FACTORY_COLLECTIONS) for (const e of collection(doc, path)) s.add(e.id);
  return s;
}
