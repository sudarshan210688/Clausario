import { BRAND, BrandMark, LEGAL } from './Brand';
import { Drawer } from './ui';

// "About Clausario" panel opened from the account menu and the footer: notice, regulation credits, copyright.

const REG_NAMES = { gdpr: 'GDPR, Regulation (EU) 2016/679', 'eu-ai-act': 'EU AI Act, Regulation (EU) 2024/1689' } as const;

export function AboutPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer title={`About ${BRAND.name}`} open={open} onClose={onClose}>
      <div className="about" data-testid="about-panel">
        <div className="about-brand">
          <BrandMark size={40} />
          <div>
            <strong>{BRAND.name}</strong>
            <p className="muted small">{BRAND.caption}</p>
          </div>
        </div>

        <h3>Notice</h3>
        <ul className="about-list">
          {LEGAL.notice.map(([head, body]) => (
            <li key={head}>
              <strong>{head}</strong> {body}
            </li>
          ))}
        </ul>

        <h3>Regulation sources</h3>
        <ul className="about-list">
          {(Object.keys(LEGAL.sources) as (keyof typeof LEGAL.sources)[]).map((id) => {
            const s = LEGAL.sources[id];
            return (
              <li key={id}>
                <strong>{REG_NAMES[id]}.</strong> Text from{' '}
                <a href={s.siteUrl} target="_blank" rel="noopener noreferrer">
                  {s.site}
                </a>{' '}
                ({s.operator}). Official text:{' '}
                <a href={s.official} target="_blank" rel="noopener noreferrer">
                  EUR-Lex
                </a>
                .
              </li>
            );
          })}
        </ul>
        <p className="muted small">{LEGAL.euCredit}</p>
        <p className="muted small">The source sites' page layout, recital links and annex links belong to their operators. Clausario is not affiliated with them.</p>

        <p className="about-copy">{LEGAL.copyright}</p>
      </div>
    </Drawer>
  );
}
