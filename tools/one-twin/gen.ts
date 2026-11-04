/**
 * Generated files (run `npm run gen:twin` after changing packages/schema or packages/core):
 *   schemas/*.schema.json             JSON Schema 2020-12 of each document type
 *   docs/one-twin/edit-api.md         the edit API command list
 *   assets/one-twin/structure-catalog.json   the design structure catalogue (classes, slots, joins, verified pairs)
 *   docs/one-twin/structure.md        the same as a table
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { Factory, Machine, BlockDef, Spec, StructureCatalog, STRUCTURE_CATALOG, MOUNT_LABEL, ROLE_LABEL, SLOT_LABEL, GROUP_LABEL } from '@one-twin/schema';
import { commandCatalog } from '@one-twin/core';

const root = new URL(`file://${process.cwd()}/`); // run from the repo root (npm run gen:twin)
const out = (rel: string, text: string) => { const u = new URL(rel, root); mkdirSync(new URL('.', u), { recursive: true }); writeFileSync(u, text); console.log('wrote', rel); };
const js = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

const docs = { factory: Factory, machine: Machine, block: BlockDef, spec: Spec, 'structure-catalog': StructureCatalog };
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


out('assets/one-twin/structure-catalog.json', js(STRUCTURE_CATALOG));
const C = STRUCTURE_CATALOG, slots = ['floor', 'top', 'side', 'inside', 'front'] as const;
let sm = '# 설계 구조 카탈로그\n\n자동 생성 파일입니다 (`npm run gen:twin`). 원본: `packages/schema/src/structure.ts`. 규칙 엔진: `packages/core/src/structure.ts`.\n\n'
  + '객체마다 **분류**가 있고, 분류마다 역할(어떻게 받쳐지는가) · 받을 수 있는 자리 · 남에게 내주는 자리 · 자리별 결합 방식이 정해져 있습니다. '
  + '**검증된 조합**은 기준 설비(조립 · 도포 · 브레이징 · 검사)와 표준 관례에서 온 것이고, 목록 밖의 조합은 경고만 하고 막지 않습니다.\n\n'
  + `## 분류 (v${C.version})\n\n| 분류 | 그룹 | 역할 | 받는 자리 (우선순) | 내주는 자리 | 결합 방식 | 이름 키워드 |\n|---|---|---|---|---|---|---|\n`;
for (const c of C.classes) { const needs = c.needs || C.needsByRole[c.role], host = [c.host.top && '윗면', c.host.side && '옆면', c.host.inside && '안', c.host.front && '앞', c.host.stack && `적재 ${c.host.stack} mm`].filter(Boolean).join(' · ') || '—';
  const mount = needs.map(k => `${SLOT_LABEL[k]}: ${MOUNT_LABEL[c.mount?.[k] || C.mountBySlot[k]]}`).join('<br>');
  sm += `| \`${c.cls}\` ${c.label}${c.solid ? ' (고체)' : ''} | ${GROUP_LABEL[c.group]} | ${ROLE_LABEL[c.role]} | ${needs.map(k => SLOT_LABEL[k]).join(' · ')} | ${host} | ${mount} | ${c.words.join(', ')} |\n`; }
sm += '\n## 검증된 조합 (부품 > 받침)\n\n| 자리 | 조합 |\n|---|---|\n';
for (const k of slots) sm += `| ${SLOT_LABEL[k]} | ${C.verified[k].map(x => `\`${x}\``).join(', ')} |\n`;
sm += '\n고체(solid)끼리는 겹치면 거부, 그 밖의 겹침은 경고 (실제 형상은 상자가 아니므로: 의자는 작업대 밑에 들어감).\n';
out('docs/one-twin/structure.md', sm);
