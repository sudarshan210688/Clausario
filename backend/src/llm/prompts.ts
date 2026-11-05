import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import type { Scenario } from '../schemas/scenario.schema.js';

// Scenario generation prompt, ICEPOT-structured (Architecture.md §8.3, §8.4).

export interface PromptInput {
  story: string;
  packText: string;
  /** Scenarios to write in this call. */
  count: number;
  /** Packed articles that must each get ≥ 1 scenario in this call, e.g. `Art. 17 GDPR — Right to erasure`. */
  mustCover: string[];
  /** Retry for the remainder: scenarios already accepted (not to be duplicated). */
  existing?: Pick<Scenario, 'id' | 'title' | 'mappedClauses'>[];
}

const EXAMPLE: Scenario = {
  id: 'TS-001',
  title: 'Erasure request is honoured once the data is no longer needed for its purpose',
  regulation: 'GDPR',
  mappedClauses: ['Art. 17(1)(a) GDPR'],
  priority: 'High',
  prerequisites: [
    'A registered data subject account exists with profile and order history data',
    'The retention purpose for the order history has expired',
  ],
  steps: [
    'Log in as the data subject and submit an erasure request from the privacy settings page',
    'As the controller, process the request through the erasure workflow',
    'Query the production data stores and backups index for the data subject identifier',
  ],
  expectedResult:
    'All personal data of the data subject that is no longer necessary for its purpose is erased without undue delay and the data subject receives confirmation of erasure',
};

const PERSONA =
  'You are a senior QA compliance analyst specialised in the GDPR and the EU AI Act. ' +
  'You design compliance test scenarios that verify a software requirement meets specific legal provisions.';

const TONE =
  'Tone: precise, neutral and testable. Describe observable system behaviour. Do not give legal advice, do not ' +
  'speculate about legal interpretation, and do not use hedging such as "may be compliant".';

const PRIORITY_GUIDE =
  'Priority: High = prohibited practices, high-risk AI obligations, data subject rights, lawful basis, breach handling; ' +
  'Medium = transparency, documentation, record-keeping; Low = governance, administrative duties.';

export function buildGenerationMessages(input: PromptInput): BaseMessage[] {
  const { count } = input;
  const instruction = [
    `## Instruction`,
    `Generate exactly ${count} compliance test scenario${count === 1 ? '' : 's'} for the requirement below, ` +
      'tested against the packed legal clauses.',
    '- Test SCENARIOS only: no test cases, no test data values, no test case IDs beyond the scenario id, no automation code.',
    '- Each scenario tests one obligation or right; cite it in `mappedClauses` using clause labels exactly as they ' +
      'appear in square brackets in the context, e.g. `Art. 17(1)(a) GDPR` or `Annex III(4)(a) EU AI Act`. ' +
      'Recitals and cross-referenced articles are context only and must not be cited.',
    '- `regulation` is the regulation of the cited clauses ("GDPR" or "EU AI Act").',
    `- ${PRIORITY_GUIDE}`,
    '- 1+ prerequisites, 2–10 concrete steps, one observable expected result.',
    '- Number ids TS-001, TS-002, … in order.',
    ...(input.mustCover.length > 0
      ? ['- Coverage: each of these articles must be cited by at least one scenario:', ...input.mustCover.map((a) => `  - ${a}`)]
      : []),
  ];
  const existing = input.existing?.length
    ? [
        '## Already generated (do not repeat or overlap these)',
        ...input.existing.map((s) => `- ${s.id} ${s.title} [${s.mappedClauses.join('; ')}]`),
        '',
      ]
    : [];

  const human = [
    ...instruction,
    '',
    '## Context',
    '### Requirement',
    input.story,
    '',
    '### Packed clauses',
    input.packText,
    ...existing,
    '## Example (one scenario, format and level of detail only)',
    JSON.stringify(EXAMPLE, null, 2),
    '',
    '## Output format',
    `Return only a JSON object {"scenarios": [...]} with exactly ${count} scenario objects of the example's shape ` +
      '(id, title, regulation, mappedClauses, priority, prerequisites, steps, expectedResult). No prose, no markdown.',
  ].join('\n');

  return [new SystemMessage(`${PERSONA}\n\n${TONE}`), new HumanMessage(human)];
}
