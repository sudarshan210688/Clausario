export type StepState = 'done' | 'active' | 'locked';

export interface StepItem {
  id: string;
  label: string;
  hint: string;
  state: StepState;
}

/** Pipeline progress; done / active steps scroll to their section. */
export function Stepper({ steps }: { steps: StepItem[] }) {
  return (
    <ol className="stepper" aria-label="Analysis progress">
      {steps.map((step, i) => (
        <li key={step.id} className={`step step-${step.state}`} aria-current={step.state === 'active' ? 'step' : undefined}>
          <button
            type="button"
            className="step-btn"
            disabled={step.state === 'locked'}
            onClick={() => document.getElementById(`step-${step.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <span className="step-dot">{step.state === 'done' ? '✓' : i + 1}</span>
            <span className="step-text">
              <span className="step-label">{step.label}</span>
              <span className="step-hint">{step.hint}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
