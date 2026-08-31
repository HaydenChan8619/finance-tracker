"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Icon } from "@/components/icon";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data: { authenticated?: boolean }) => {
        if (active && data.authenticated) {
          router.replace("/dashboard");
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to sign in.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("The server could not be reached. Check that the app is running.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="surface login-panel" aria-labelledby="login-title">
        <Link href="/" className="brand" aria-label="Finance Tracker home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">
            Finance Tracker
            <small>private ledger</small>
          </span>
        </Link>
        <h1 id="login-title">Welcome back.</h1>
        <p>Sign in to see the records stored on your private workspace.</p>
        <form className="login-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Admin email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button className="button button-primary" type="submit" disabled={loading}>
            <Icon name="lock" className="icon-sm" />
            {loading ? "Checking access…" : "Open private workspace"}
          </button>
        </form>
        <p className="login-footer">
          <Link href="/">Return to public preview</Link>
        </p>
      </section>
    </main>
  );
}
