import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/auth';
import { ErrorBanner } from '../components/ErrorBanner';
import { PageHeader } from '../components/ui';
import { api } from '../services/api';
import type { EngineId, ProviderId } from '../types/api';

// New analysis (Architecture.md §14.3): story editor + Run settings. Submitting starts a background run (§13.1).

const EXAMPLES: { label: string; story: string }[] = [
  {
    label: 'Account deletion',
    story: 'As a registered user, I want to delete my account so that all my personal data is erased from the platform, including backups, within 30 days.',
  },
  {
    label: 'AI CV screening',
    story: "As an HR manager, I want an AI model to rank job applicants' CVs and automatically reject the lowest-scoring candidates, so that recruiters only review the top 20%.",
  },
  {
    label: 'Support chatbot',
    story: 'As a customer, I want to chat with a support assistant powered by a large language model that can look up my order history, so that I get answers 24/7.',
  },
];

const COUNTS = [5, 10, 20] as const;
const PROVIDER_LABEL: Record<ProviderId, string> = { openai: 'OpenAI', anthropic: 'Anthropic', groq: 'Groq', inception: 'Inception' };
const MAX_STORY = 10_000;

export function AnalyzePage() {
  const { config } = useAuth();
  const navigate = useNavigate();
  const providers = config?.generation.providers ?? [];
  const [story, setStory] = useState('');
  const [engine, setEngine] = useState<EngineId | ''>('');
  const [provider, setProvider] = useState<ProviderId | ''>('');
  const [model, setModel] = useState('');
  const [count, setCount] = useState<number>(5);
  const [custom, setCustom] = useState(false);
  const [evaluate, setEvaluate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    if (!provider && providers[0]) {
      setProvider(providers[0].id);
      setModel(providers[0].default);
    }
  }, [providers, provider]);

  const models = providers.find((p) => p.id === provider)?.models ?? [];
  const max = config?.generation.scenarioMaxCount ?? 50;
  const tooShort = story.trim().length < 20;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (tooShort || !provider || !model || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const { runId } = await api.startRun({
        story: story.trim(),
        provider,
        model,
        count,
        ...(engine ? { engine } : {}),
        ...(config?.evaluation.enabled ? { evaluate } : {}),
      });
      navigate(`/runs/${runId}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title="New analysis" subtitle="Describe a requirement. Clausario classifies it, picks the articles, asks for review when unsure, and writes test scenarios." />
      <form className="analyze-grid" onSubmit={submit}>
        <section className="panel">
          <header className="panel-head">
            <h2>Requirement</h2>
            <div className="examples" aria-label="Examples">
              {EXAMPLES.map((ex) => (
                <button key={ex.label} type="button" className="chip" onClick={() => setStory(ex.story)}>
                  {ex.label}
                </button>
              ))}
            </div>
          </header>
          <div className="textarea-wrap">
            <textarea
              aria-label="User story or requirement"
              data-testid="story"
              rows={10}
              maxLength={MAX_STORY}
              placeholder="As a registered user, I want to…"
              value={story}
              onChange={(e) => setStory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
              }}
            />
            <span className="char-count">
              {story.length.toLocaleString()} / {MAX_STORY.toLocaleString()}
            </span>
          </div>
          <p className="muted small">
            At least 20 characters. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> starts the run. Don't paste confidential data: stories go to the configured model providers.
          </p>
        </section>

        <aside className="panel settings-card">
          <h2>Run settings</h2>
          {config?.engines.uiSwitch && (
            <label className="field">
              <span>Classification engine</span>
              <select value={engine} onChange={(e) => setEngine(e.target.value as EngineId | '')} data-testid="engine">
                <option value="">Default ({config.engines.stages.route === 'jev' ? 'Jev' : 'Decisions API'})</option>
                {config.engines.available
                  .filter((a) => a.keyed)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id === 'jev' ? 'Jev' : 'OpenAI Decisions'} · {a.model}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Generation provider</span>
            <select
              value={provider}
              onChange={(e) => {
                const next = providers.find((p) => p.id === e.target.value);
                setProvider((next?.id ?? '') as ProviderId | '');
                setModel(next?.default ?? '');
              }}
            >
              {providers.length === 0 && <option value="">No provider configured</option>}
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {PROVIDER_LABEL[p.id]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Scenarios</span>
            <div className="segmented" role="group" aria-label="Scenario count">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={!custom && count === n ? 'on' : undefined}
                  onClick={() => {
                    setCustom(false);
                    setCount(n);
                  }}
                >
                  {n}
                </button>
              ))}
              <button type="button" className={custom ? 'on' : undefined} onClick={() => setCustom(true)}>
                Custom
              </button>
            </div>
            {custom && (
              <input type="number" className="narrow" min={1} max={max} value={count} aria-label="Custom scenario count" onChange={(e) => setCount(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
            )}
          </div>
          {config?.evaluation.enabled ? (
            <label className="switch">
              <input type="checkbox" checked={evaluate} onChange={(e) => setEvaluate(e.target.checked)} />
              <span>Evaluate after generation</span>
            </label>
          ) : (
            <p className="muted small">Evaluation is turned off (EVAL_ENABLED=false).</p>
          )}
          <p className="muted small">
            Review threshold {config?.review.threshold ?? '–'} · up to {config?.review.maxRounds ?? '–'} add-context rounds
          </p>
          {error !== undefined && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}
          <button type="submit" className="primary block" disabled={tooShort || !provider || !model || busy} data-testid="start-run">
            {busy ? 'Starting…' : 'Analyse story →'}
          </button>
        </aside>
      </form>
    </div>
  );
}
