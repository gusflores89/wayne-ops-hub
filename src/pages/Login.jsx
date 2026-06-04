import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import Field from "../components/Field.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    setLoading(false);
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="login-brand">
          <ShieldCheck size={34} />
          <p>OPS HUB</p>
          <h1>Wayne Ops Hub</h1>
        </div>
        <form onSubmit={handleSubmit} className="form-stack">
          <Field label="Email">
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </Field>
          <Field label="Password">
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          </Field>
          {error && <p className="error-text">{error}</p>}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
