import { z } from 'zod';
/**
 * spec sections (R1 §4.5, 머신빌더 블록 목록 "스펙 스키마" / "스펙 규칙").
 * Every section is in the schema from the start; a missing section is null and every field may be
 * null. Save and export always keep the nulls. UI shows only io.io_list (tag · dir · type) and
 * product.maker / model in V1; the rest is hidden (feature flag spec.<section>.visible).
 */
const num = z.number().nullable();
const str = z.string().nullable();
const ref = z.string().nullable(); // id of a factory node (power drop, panel, …)
const int = z.number().int().nullable();

export const IoListEntry = z.object({
  tag: z.string(), dir: z.enum(['in', 'out']), type: z.enum(['bool', 'int', 'real']),
  signal: str.optional(), address: str.optional(), terminal: str.optional(), cable: str.optional(),
});

export const SpecSections = {
  electrical: z.object({
    voltage: num, phase: z.enum(['1P', '3P']).nullable(), frequency: num, rated_power: num, rated_current: num,
    inrush_current: num, control_voltage: str, control_power: num, connector: str, breaker_rating: num,
    cable_spec: str, power_drop_ref: ref, panel_ref: ref,
  }).partial(),
  io: z.object({
    di_count: int, do_count: int, ai_count: int, ao_count: int, io_list: z.array(IoListEntry).nullable(),
    sensor_wiring: str, safety_io: z.array(z.unknown()).nullable(),
  }).partial(),
  comm: z.object({
    protocol: str, ip_address: str, node_id: str, port: int,
    tag_map: z.array(z.object({ tag: z.string(), address: z.string() })).nullable(), network_ref: ref, safety_protocol: str,
  }).partial(),
  pneumatic: z.object({ supply_pressure: num, air_consumption: num, port_size: str, valve_count: int, air_drop_ref: ref }).partial(),
  hydraulic: z.object({ pressure: num, flow: num, unit_ref: ref }).partial(),
  gas: z.object({ type: str, flow: num, pressure: num, gas_drop_ref: ref }).partial(),
  water: z.object({ type: str, flow: num, temp: num, pressure: num }).partial(),
  exhaust: z.object({ flow: num, type: str }).partial(),
  safety: z.object({ category: str, pl: str, sil: str, emo_group: str }).partial(),
  physical: z.object({ weight: num, noise: num, heat_output: num }).partial(),
  product: z.object({ maker: str, model: str, serial: str, url: str, manual_ref: str, cad_ref: str, price: num, lead_time: num }).partial(),
  maintenance: z.object({ interval: num, last_date: str, spare_parts: z.array(z.string()).nullable() }).partial(),
};
export type SpecSectionName = keyof typeof SpecSections;
export const SPEC_SECTIONS = Object.keys(SpecSections) as SpecSectionName[];

export const Spec = z.object({
  ...Object.fromEntries(SPEC_SECTIONS.map(k => [k, SpecSections[k].nullable()])) as { [K in SpecSectionName]: z.ZodNullable<(typeof SpecSections)[K]> },
  meta: z.object({ spec_version: z.string(), verified: z.boolean() }),
});
export type Spec = z.infer<typeof Spec>;

/** A spec with every section null (what a new block, machine or factory starts with). */
export function emptySpec(): Spec {
  const s = Object.fromEntries(SPEC_SECTIONS.map(k => [k, null])) as Record<SpecSectionName, null>;
  return { ...s, meta: { spec_version: '1.0', verified: false } };
}
/** Sections shown in V1 (spec 규칙 "UI 숨김"). */
export const SPEC_VISIBLE_V1: Partial<Record<SpecSectionName, string[]>> = { io: ['io_list'], product: ['maker', 'model'] };
