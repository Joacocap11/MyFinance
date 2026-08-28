import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../api/client";
import { useAuth } from "../auth";

export function RegisterPage() {
  const { register, ready, session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (ready && session) void navigate("/", { replace: true });
  }, [navigate, ready, session]);
  if (!ready) return <main className="login-page"><div className="state" role="status">Validando sesión…</div></main>;
  if (session) return null;

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
      setError(reason instanceof ApiError ? reason.message : "No se pudo crear el usuario");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="register-title">
        <div className="login-brand"><span className="brand__mark" aria-hidden="true">M</span><span>MyFinance</span></div>
        <p className="eyebrow">Primera instalación</p>
        <h1 id="register-title">Creá el usuario administrador.</h1>
        <p className="login-intro">El registro público solo funciona mientras no exista ningún usuario. Luego, un administrador invita al resto desde Ajustes.</p>
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label className="field"><span className="field__label">Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus required /></label>
          <label className="field"><span className="field__label">Contraseña</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label>
          <label className="field"><span className="field__label">Repetir contraseña</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required /></label>
          {error && <p className="state state--error login-error" role="alert">{error}</p>}
          <button className="button button--primary login-submit" type="submit" disabled={submitting}>{submitting ? "Creando…" : "Crear usuario administrador"}</button>
        </form>
        <p className="login-intro"><Link to="/login">Volver a iniciar sesión</Link></p>
      </section>
    </main>
  );
}
