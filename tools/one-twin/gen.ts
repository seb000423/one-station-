/**
 * Generated files (run `npm run gen:twin` after changing packages/schema or packages/core):
 *   schemas/*.schema.json             JSON Schema 2020-12 of each document type
 *   docs/one-twin/edit-api.md         the edit API command list
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { Factory, Machine, BlockDef, Spec } from '@one-twin/schema';
import { commandCatalog } from '@one-twin/core';

const root = new URL(`file://${process.cwd()}/`); // run from the repo root (npm run gen:twin)
const out = (rel: string, text: string) => { const u = new URL(rel, root); mkdirSync(new URL('.', u), { recursive: true }); writeFileSync(u, text); console.log('wrote', rel); };
const js = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

const docs = { factory: Factory, machine: Machine, block: BlockDef, spec: Spec };
for (const [name, s] of Object.entries(docs)) {
  out(`schemas/${name}.schema.json`, js({ $id: `https://one-station-beta.vercel.app/schemas/${name}.schema.json`, ...z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' }) }));
}

const cat = commandCatalog();
const argList = (a: unknown): string => {
  const s = a as { properties?: Record<string, { description?: string }>; required?: string[] };
  return Object.keys(s.properties ?? {}).map(k => (s.required ?? []).includes(k) ? `\`${k}\`` : `\`${k}?\``).join(', ');
};
let md = '# ONE Twin 편집 API 명령 목록\n\n자동 생성 파일입니다 (`npm run gen:twin`). 원본: `packages/core/src/commands.ts`.\n\n'
  + '모든 편집은 이 명령으로만 합니다 (기준서 R1 §2 원칙 4). 좌표는 mm, 각도는 deg, Z-up (`packages/schema/src/units.ts`).\n'
  + '`Editor.exec(name, args)`가 인자를 검증하고 실행하며, 모든 명령은 Undo/Redo가 됩니다.\n\n';
for (const scope of ['factory', 'machine'] as const) {
  md += `## ${scope === 'factory' ? '공장 (factory)' : '설비 (machine)'}\n\n| 명령 | 설명 | 인자 (?는 생략 가능) |\n|---|---|---|\n`;
  for (const c of cat.filter(c => c.scope === scope)) md += `| \`${c.name}\` | ${c.description} | ${argList(c.args)} |\n`;
  md += '\n';
}
md += '## 이후 단계에서 추가\n\n| 명령 | 단계 |\n|---|---|\n| `run_scenario` | 5단계 (시뮬 엔진) |\n| `add_socket`, `set_joint`, `add_sequence_step` | 3단계 (머신빌더) |\n| `add_level` | 4단계 (팩토리빌더) |\n';
out('docs/one-twin/edit-api.md', md);

