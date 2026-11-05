import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import type { Scenario } from '../schemas/scenario.schema.js';

// Fake generation model for tests and CLAUSARIO_FAKE_ENGINES demos. It reads the prompt: "Generate exactly N …"
// and the packed clause labels `[Art. 17(1) GDPR]`, and returns N scenarios citing one clause per article in turn.

const textOf = (messages: BaseMessage[]) => messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');

export function fakeScenarios(prompt: string): Scenario[] {
  const count = Number(prompt.match(/Generate exactly (\d+)/)?.[1] ?? 5);
  const labels = [...prompt.matchAll(/\[((?:Art\.|Annex) [^\]]+?(?:GDPR|EU AI Act))\]/g)].map((m) => m[1]);
  const perArticle = [...new Map(labels.map((l) => [l.replace(/\(.*?\)/g, ''), l])).values()];
  const pool = perArticle.length > 0 ? perArticle : ['Art. 17(1) GDPR'];
  return Array.from({ length: count }, (_, i) => {
    const clause = pool[i % pool.length];
    return {
      id: `TS-${String(i + 1).padStart(3, '0')}`,
      title: `Verify obligation ${clause} (case ${i + 1})`,
      regulation: clause.endsWith('EU AI Act') ? 'EU AI Act' : 'GDPR',
      mappedClauses: [clause],
      priority: i % 3 === 0 ? 'High' : 'Medium',
      prerequisites: ['A test account exists'],
      steps: ['Open the feature under test', `Exercise the behaviour required by ${clause}`, 'Record the outcome'],
      expectedResult: `The system meets ${clause}.`,
    };
  });
}

export interface FakeModelOptions {
  /** Called before each call; return an Error to make that call fail. */
  fail?: () => Error | null;
  onCall?: () => void;
}

/** A chat model stand-in with `invoke` and `withStructuredOutput(…, { includeRaw: true })`. */
export function fakeScenarioModel(options: FakeModelOptions = {}): BaseChatModel {
  const respond = async (messages: BaseMessage[]) => {
    options.onCall?.();
    const error = options.fail?.();
    if (error) throw error;
    const scenarios = fakeScenarios(textOf(messages));
    const raw = new AIMessageChunk({
      content: JSON.stringify({ scenarios }),
      usage_metadata: { input_tokens: 1000, output_tokens: 200 * scenarios.length, total_tokens: 1000 + 200 * scenarios.length },
    });
    return { raw, parsed: { scenarios } };
  };
  return {
    invoke: async (messages: BaseMessage[]) => (await respond(messages)).raw,
    withStructuredOutput: () => RunnableLambda.from(respond),
  } as unknown as BaseChatModel;
}
