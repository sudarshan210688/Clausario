import { REGULATIONS, type RegId } from '../config/chapterMap.js';
import { env, type EngineId } from '../config/env.js';
import { compareDocs, expand, type Expansion, type Graph } from '../okf/graph.js';
import { getKnowledge, type LoadedDoc } from '../okf/loader.js';
import { addTokens, toUsage, type Usage } from '../usage.js';
import { type DecideResult, type Question, type Transport } from './client.js';
import { decideStage } from './engines/runnable.js';

// SELECT (Architecture.md §7.2): stage 1 one predicate per chapter, stage 2 one predicate per article of the kept
// chapters, then 1-hop EXPAND (§7.3). Questions are built from frontmatter title + description.

export interface ScoredArticle {
  id: string;
  regulation: RegId;
  p: number;
}

export interface SelectResult {
  /** Every asked chapter, bundle order. */
  chapters: { id: string; p: number; kept: boolean }[];
  /** Ranked: p desc (article order = rank for pack drop step 5). */
  selected: { id: string; regulation: RegId; chapter: number; title: string; p: number }[];
  expansion: Expansion;
  /** Doc ids whose question was refused (p = 0). */
  refusals: string[];
  /** Both stages. */
  usage: Usage;
}

/** `gdpr:ch-03` → `ch_gdpr_03`; `eu-ai-act:art-004a` → `art_eu_ai_act_004a`. */
export function questionName(doc: LoadedDoc): string {
  const [prefix, num] = doc.id.slice(doc.reg.length + 1).split('-');
  return `${prefix}_${doc.reg.replace(/-/g, '_')}_${num}`;
}

/** Text after the first " — ": `Art. 17 GDPR — Right to erasure` → `Right to erasure`. */
const shortTitle = (title: string) => title.split(' — ').slice(1).join(' — ') || title;

export function buildChapterQuestions(chapters: readonly LoadedDoc[]): Question[] {
  return chapters.map((doc) => ({
    type: 'predicate',
    name: questionName(doc),
    instructions:
      `Could ${REGULATIONS[doc.reg].name} ${doc.frontmatter.title} (${doc.frontmatter.description}) ` +
      'contain obligations or rights relevant to the requirement in the input?',
  }));
}

export function buildArticleQuestions(articles: readonly LoadedDoc[]): Question[] {
  return articles.map((doc) => {
    const fm = doc.frontmatter;
    const num = fm.type === 'Article' ? fm.article : '';
    return {
      type: 'predicate',
      name: questionName(doc),
      instructions:
        `Does Article ${num} ${REGULATIONS[doc.reg].name} — ${shortTitle(fm.title)} (${fm.description}) ` +
        'impose an obligation or grant a right that the requirement in the input must satisfy or be tested against?',
    };
  });
}

/** Keep p ≥ threshold, sort p desc (ties by id), cap `topN` per regulation. */
export function pickArticles(scored: readonly ScoredArticle[], threshold: number, topN: number): ScoredArticle[] {
  const perReg = new Map<RegId, number>();
  return scored
    .filter((a) => a.p >= threshold)
    .sort((a, b) => b.p - a.p || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter((a) => {
      const n = perReg.get(a.regulation) ?? 0;
      perReg.set(a.regulation, n + 1);
      return n < topN;
    });
}

/** `transport` (tests) bypasses the engine chain; `engine` overrides SELECT_ENGINE for this call. */
export async function selectArticles(
  story: string,
  regs: readonly RegId[],
  transport?: Transport,
  engine?: EngineId,
  graph: Graph = getKnowledge(),
): Promise<SelectResult> {
  const docs = [...graph.docs.values()].filter((doc) => regs.includes(doc.reg)).sort(compareDocs);
  const ofType = (type: 'Chapter' | 'Article') => docs.filter((doc) => doc.frontmatter.type === type);
  const refusedIds = (answers: DecideResult, asked: LoadedDoc[]) => {
    const refused = new Set(answers.refusals);
    return asked.filter((doc) => refused.has(questionName(doc))).map((doc) => doc.id);
  };

  const chapterDocs = ofType('Chapter');
  const chapterAnswers = await decideStage('select', story, buildChapterQuestions(chapterDocs), { transport, engine });
  const chapters = chapterDocs.map((doc) => {
    const p = chapterAnswers.predicates[questionName(doc)];
    return { id: doc.id, p, kept: p >= env.CHAPTER_THRESHOLD };
  });

  const kept = new Set(chapters.filter((ch) => ch.kept).map((ch) => ch.id));
  const articleDocs = ofType('Article').filter((doc) => kept.has(graph.edges.get(doc.id)!.chapter));
  const articleAnswers = await decideStage('select', story, buildArticleQuestions(articleDocs), { transport, engine });
  const picked = pickArticles(
    articleDocs.map((doc) => ({ id: doc.id, regulation: doc.reg, p: articleAnswers.predicates[questionName(doc)] })),
    env.ARTICLE_THRESHOLD,
    env.SELECT_TOP_N,
  );

  return {
    chapters,
    selected: picked.map(({ id, regulation, p }) => {
      const fm = graph.docs.get(id)!.frontmatter;
      return { id, regulation, chapter: fm.type === 'Article' ? fm.chapter : 0, title: fm.title, p };
    }),
    expansion: expand(graph, picked.map((a) => a.id)),
    refusals: [...refusedIds(chapterAnswers, chapterDocs), ...refusedIds(articleAnswers, articleDocs)],
    usage: {
      ...toUsage(articleAnswers.model, chapterAnswers.calls + articleAnswers.calls, addTokens(chapterAnswers.tokens, articleAnswers.tokens)),
      engine: articleAnswers.engine,
      fallbackUsed: chapterAnswers.fallbackUsed || articleAnswers.fallbackUsed,
    },
  };
}
