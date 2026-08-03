"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { login } from "../../../lib/api/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to log in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>Log In</h2>

      {error && (
        <div className="alertBanner" role="alert">
          <div className="alertIcon">!</div>
          <span>{error}</span>
        </div>
      )}

      <div className="formGroup">
        <label className="formLabel" htmlFor="email-input">Email Address</label>
        <input
          id="email-input"
          type="email"
          className="formInput"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="formGroup">
        <label className="formLabel" htmlFor="password-input">Password</label>
        <input
          id="password-input"
          type="password"
          className="formInput"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <button type="submit" className="authButton" disabled={loading}>
        {loading ? (
          <>
            <div className="spinner" />
            <span>Signing in...</span>
          </>
        ) : (
          <span>Sign In</span>
        )}
      </button>

      <div className="authFooter">
        Don't have an account?{" "}
        <Link href="/register" className="authLink">
          Sign up
        </Link>
      </div>
    </form>
  );
}
