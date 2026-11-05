import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/auth';
import { BRAND, BrandMark, HeroArt, LEGAL } from '../components/Brand';
import { ErrorBanner } from '../components/ErrorBanner';

export function LoginPage() {
  const { me, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  if (me) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await login(username, password);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-hero" aria-hidden="true">
        <HeroArt />
        <p className="login-hero-text">{BRAND.tagline} GDPR and EU AI Act articles, mapped to test scenarios, with a human in the loop.</p>
      </section>
      <section className="login-card panel">
        <div className="login-brand">
          <BrandMark size={44} />
          <div>
            <h1>{BRAND.name}</h1>
            <p className="brand-caption-lg">{BRAND.caption}</p>
          </div>
        </div>
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Username</span>
            <input name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error !== undefined && <ErrorBanner error={error} />}
          <button type="submit" className="primary block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="muted small login-legal">
          Educational use only · Not legal advice · Use synthetic data only
          <br />
          {LEGAL.copyright}
        </p>
      </section>
    </div>
  );
}
