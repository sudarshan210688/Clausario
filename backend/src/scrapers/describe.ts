import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { env } from '../config/env.js';
import { createChatModel } from '../llm/providerFactory.js';
import type { Description } from '../okf/writer.js';
import { tokensFromMessage, type Tokens } from '../usage.js';
import { capChars, templateDescription, type DescriptionInput } from './descriptionTemplate.js';

// One-line OKF descriptions at scrape time: template when DESCRIPTION_MODEL is empty, else OpenAI chat via the
// provider factory (Architecture.md §6.2a, §8.1).

// Models sometimes overrun the 30-word instruction; cap like the template instead of failing the job.
const DescriptionText = z
  .string()
  .transform((text) => capChars(text.replace(/\s+/g, ' ').replace(/^["'“]+|["'”]+$/g, '').trim()))
  .pipe(z.string().min(1).max(400));

const MAX_INPUT_CHARS = 8000;

/** `template` or `openai/<model>`; throws if a model is set without OPENAI_API_KEY. */
export function descriptionSource(): string {
  if (!env.DESCRIPTION_MODEL) return 'template';
  if (!env.OPENAI_API_KEY) {
    throw new Error('DESCRIPTION_MODEL is set but OPENAI_API_KEY is missing in backend/.env');
  }
  return `openai/${env.DESCRIPTION_MODEL}`;
}

/** Anything with LangChain's chat `invoke`; tests pass a fake. */
export type DescriptionModel = Pick<BaseChatModel, 'invoke'>;

export interface DescribeResult {
  description: Description;
  /** Tokens of the model call (Architecture.md §10.4); `null` for template descriptions (no call). */
  tokens: Tokens | null;
}

/** `model` overrides the DESCRIPTION_MODEL chat model (tests). */
export async function describe(input: DescriptionInput, model?: DescriptionModel): Promise<DescribeResult> {
  const by = descriptionSource();
  const generated = by === 'template' ? { text: templateDescription(input), tokens: null } : await describeWithOpenAI(input, model);
  const result = DescriptionText.safeParse(generated.text);
  if (!result.success) throw new Error(`invalid description for "${input.title}": ${result.error.message}`);
  return { description: { text: result.data, by }, tokens: generated.tokens };
}

async function describeWithOpenAI(
  input: DescriptionInput,
  model: DescriptionModel = createChatModel('openai', env.DESCRIPTION_MODEL!),
): Promise<{ text: string; tokens: Tokens }> {
  const message = await model.invoke([
    new SystemMessage(
      'You write one-line descriptions of EU legal provisions for a selection index. ' +
        'Reply with one plain sentence (max 30 words) stating what the provision covers and whom it obliges or protects. ' +
        'No preamble, no quotes, no markdown.',
    ),
    new HumanMessage(`${input.regulation} ${input.kind}: ${input.title}\n\n${input.body.slice(0, MAX_INPUT_CHARS)}`),
  ]);
  // usage_metadata missing (provider did not report) → 0 tokens, still one call.
  return { text: message.text, tokens: tokensFromMessage(message) };
}
