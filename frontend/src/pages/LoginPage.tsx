import { Eye, EyeOff, LockKeyhole, Mail, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth";

export function LoginPage() {
  const { login, ready, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) void navigate("/", { replace: true });
  }, [navigate, ready, session]);

  if (!ready)
    return (
      <main className="login-page">
        <div className="state" role="status">Validando sesión…</div>
      </main>
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      void navigate((location.state as { from?: string } | null)?.from ?? "/", { replace: true });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo iniciar sesión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand__mark" aria-hidden="true"><WalletCards size={22} /></span>
          <span>MyFinance</span>
        </div>
        <p className="eyebrow">Tu espacio financiero</p>
        <h1 id="login-title">Tus finanzas, en tu espacio.</h1>
        <p className="login-intro">Ingresá para continuar con el control de tus cuentas y movimientos.</p>
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span className="field__label">Email</span>
            <span className="login-input">
              <Mail size={18} aria-hidden="true" />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus required />
            </span>
          </label>
          <label className="field">
            <span className="field__label">Contraseña</span>
            <span className="login-input">
              <LockKeyhole size={18} aria-hidden="true" />
              <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
              <button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {error && <p className="state state--error login-error" role="alert">{error}</p>}
          <button className="button button--primary login-submit" type="submit" disabled={submitting}>
            {submitting ? "Ingresando…" : "Iniciar sesión"}
          </button>
        </form>
      </section>
    </main>
  );
}
