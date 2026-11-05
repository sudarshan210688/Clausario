import { env, type EngineId, type Stage } from '../../config/env.js';
import { BadRequestError } from '../../errors.js';
import { createDecisionsTransport, MAX_QUESTIONS_PER_CALL, type Transport } from '../client.js';
import { createJevTransport } from './jevTransport.js';

// Engine per stage, keys, fallbacks and transports (Architecture.md §9.4, §9.5).

export interface EngineRef {
  id: EngineId;
  model: string;
}

export const modelFor = (id: EngineId): string => (id === 'jev' ? env.JEV_MODEL : env.DECISIONS_MODEL);

/** A key is present (fake mode counts every engine as keyed). */
export function isKeyed(id: EngineId): boolean {
  if (env.CLAUSARIO_FAKE_ENGINES || factory) return true;
  return Boolean(id === 'jev' ? env.TYPESAFE_API_KEY : env.OPENAI_API_KEY);
}

export const maxPerCall = (ref: EngineRef): number => (ref.id === 'jev' ? env.JEV_MAX_QUESTIONS_PER_CALL : MAX_QUESTIONS_PER_CALL);

/** Stage engine, or a per-run override (route/select only, needs ENGINE_UI_SWITCH and a key). */
export function primaryRef(stage: Stage, override?: EngineId): EngineRef {
  if (override) {
    if (!env.ENGINE_UI_SWITCH) throw new BadRequestError('Engine switching is disabled (ENGINE_UI_SWITCH=false)');
    if (!isKeyed(override)) throw new BadRequestError(`Engine "${override}" is not configured (missing API key)`);
  }
  const id = override ?? env.ENGINES[stage];
  return { id, model: modelFor(id) };
}

/** DECISION_FALLBACKS in order, without the primary and without unkeyed engines. */
export function fallbackRefs(primary: EngineRef): EngineRef[] {
  return env.DECISION_FALLBACKS.map(({ id, model }) => ({ id, model }))
    .filter((ref) => isKeyed(ref.id))
    .filter((ref) => !(ref.id === primary.id && ref.model === primary.model));
}

export type TransportFactory = (ref: EngineRef) => Transport;
let factory: TransportFactory | null = null;

/** Tests and fake mode: replace every engine's transport. `null` restores the real ones. */
export function setTransportFactory(next: TransportFactory | null): void {
  factory = next;
}

export function transportFor(ref: EngineRef): Transport {
  if (factory) return factory(ref);
  return ref.id === 'jev' ? createJevTransport(ref.model) : createDecisionsTransport(ref.model);
}

export function availableEngines(): (EngineRef & { keyed: boolean })[] {
  return (['decisions', 'jev'] as const).map((id) => ({ id, model: modelFor(id), keyed: isKeyed(id) }));
}
