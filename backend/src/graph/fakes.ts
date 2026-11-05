import type { DecisionInput, Question, Transport } from '../decisions/client.js';

// Fake decision engine for tests and CLAUSARIO_FAKE_ENGINES demos. Deterministic answers from the input text:
// - personal data if the text mentions personal/account/user/data/candidate/customer; AI if AI/ML/model/algorithm.
// - Review strength is low when the text says "vague" and no context says "clarified"; else high (score 95).

export const fakeEngineControl: { strength: 'auto' | 'high' | 'low' } = { strength: 'auto' };

const PERSONAL = /\b(personal|account|user|users|data|candidate|candidates|customer|customers|cv|cvs)\b/i;
const AI = /\b(AI|ML|machine learning|model|algorithm|automated|automatically)\b/;

function textOf(input: DecisionInput): string {
  if (typeof input === 'string') return input;
  return JSON.stringify(input);
}

function strengthOf(text: string): 'high' | 'low' {
  if (fakeEngineControl.strength !== 'auto') return fakeEngineControl.strength;
  return /\bvague\b/i.test(text) && !/\bclarified\b/i.test(text) ? 'low' : 'high';
}

function regulationOf(text: string): string {
  const story = text.split('Routed regulations:')[0];
  const p = PERSONAL.test(story);
  const a = AI.test(story);
  return p && a ? 'both' : p ? 'gdpr' : a ? 'eu_ai_act' : 'none';
}

function answer(q: Question, text: string): Record<string, unknown> {
  const high = strengthOf(text) === 'high';
  const story = text.split('Routed regulations:')[0];
  if (q.type === 'predicate') {
    const p = (() => {
      if (q.name === 'involves_personal_data') return PERSONAL.test(story) ? 0.95 : 0.05;
      if (q.name === 'involves_ai_system') return AI.test(story) ? 0.95 : 0.05;
      if (q.name === 'articles_relevant') return high ? 0.95 : 0.2;
      if (q.name === 'article_missing') return high ? 0.05 : 0.8;
      if (q.name.endsWith('_duplicate_of_another')) return 0.05;
      if (q.name.startsWith('ch_')) return 0.9;
      if (q.name.startsWith('art_')) return 0.8;
      if (q.name.startsWith('cov_')) return 0.9;
      return 0.5;
    })();
    return { type: 'predicate', name: q.name, probability: p };
  }
  if (q.type === 'choice') {
    if (q.name === 'regulation') return { type: 'choice', name: q.name, choice: regulationOf(text), confidence: 0.95 };
    if (q.name === 'reg_check') return { type: 'choice', name: q.name, choice: regulationOf(text), confidence: high ? 0.95 : 0.4 };
    return { type: 'choice', name: q.name, choice: q.choices.find((c) => c.value === 'correct')?.value ?? q.choices[0].value, confidence: 0.9 };
  }
  const labels = q.levels.map((l) => l.label);
  const top = q.name === 'story_specific' && !high ? 0 : labels.length - 1;
  return {
    type: 'score',
    name: q.name,
    probabilities: labels.map((label, i) => ({ label, probability: i === top ? 0.9 : i === labels.length - 2 && top !== 0 ? 0.1 : top === 0 && i === 1 ? 0.1 : 0 })),
  };
}

export function createFakeDecisionTransport(onCall?: (questions: Question[]) => void): Transport {
  return async (input, questions) => {
    onCall?.(questions);
    const text = textOf(input);
    return { answers: questions.map((q) => answer(q, text)), usage: { input_tokens: 100, output_tokens: 0, total_tokens: 100 } };
  };
}
