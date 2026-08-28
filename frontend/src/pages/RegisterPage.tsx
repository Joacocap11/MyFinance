import { Eye, EyeOff, LockKeyhole, Mail, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client";
import { useAuth } from "../auth";

export function RegisterPage() {
  const { register, ready, session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ enabled: boolean; remaining_slots: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) void navigate("/", { replace: true });
  }, [navigate, ready, session]);

  useEffect(() => {
    void api.auth.registrationStatus()
      .then((next) => setStatus(next))
      .catch(() => setError("No se pudo consultar el estado del registro"));
  }, []);

  if (!ready) return <main className="login-page"><div className="state" role="status">Validando sesión…</div></main>;
  if (session) return null;
  const registrationClosed = status !== null && !status.enabled;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password);
      void navigate("/", { replace: true });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo crear la cuenta");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="register-title">
        <div className="login-brand">
          <span className="brand__mark" aria-hidden="true"><WalletCards size={22} /></span>
          <span>MyFinance</span>
        </div>
        <p className="eyebrow">Tu espacio financiero</p>
        <h1 id="register-title">Creá tu cuenta.</h1>
        <p className="login-intro">Tus datos financieros quedarán separados de los demás usuarios de esta instalación.</p>
        {registrationClosed && (
          <p className="state state--error login-error" role="status">
            Se alcanzó el límite máximo de cuentas de esta instalación.
          </p>
        )}
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span className="field__label">Email</span>
            <span className="login-input">
              <Mail size={18} aria-hidden="true" />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus required disabled={registrationClosed} />
            </span>
          </label>
          <label className="field">
            <span className="field__label">Contraseña</span>
            <span className="login-input">
              <LockKeyhole size={18} aria-hidden="true" />
              <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required disabled={registrationClosed} />
              <button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} disabled={registrationClosed}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          <label className="field">
            <span className="field__label">Confirmar contraseña</span>
            <span className="login-input">
              <LockKeyhole size={18} aria-hidden="true" />
              <input type={showConfirmation ? "text" : "password"} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required disabled={registrationClosed} />
              <button className="password-toggle" type="button" onClick={() => setShowConfirmation((value) => !value)} aria-label={showConfirmation ? "Ocultar confirmación" : "Mostrar confirmación"} aria-pressed={showConfirmation} disabled={registrationClosed}>
                {showConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {error && !registrationClosed && <p className="state state--error login-error" role="alert">{error}</p>}
          <button className="button button--primary login-submit" type="submit" disabled={submitting || registrationClosed}>
            {submitting ? "Creando…" : "Crear cuenta"}
          </button>
        </form>
        <p className="login-intro"><Link to="/login">Ya tengo cuenta / Iniciar sesión</Link></p>
      </section>
    </main>
  );
}
