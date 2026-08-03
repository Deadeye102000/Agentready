"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { register } from "../../../lib/api/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationName || !email || !password) {
      setError("Please fill out all required fields.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await register(email, password, organizationName);
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to register. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>Create Account</h2>

      {error && (
        <div className="alertBanner" role="alert">
          <div className="alertIcon">!</div>
          <span>{error}</span>
        </div>
      )}

      <div className="formGroup">
        <label className="formLabel" htmlFor="org-name-input">Organization Name</label>
        <input
          id="org-name-input"
          type="text"
          className="formInput"
          placeholder="e.g. Acme Corp"
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          required
          disabled={loading}
        />
      </div>

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
          placeholder="Min 8 characters"
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
            <span>Creating account...</span>
          </>
        ) : (
          <span>Get Started</span>
        )}
      </button>

      <div className="authFooter">
        Already have an account?{" "}
        <Link href="/login" className="authLink">
          Log in
        </Link>
      </div>
    </form>
  );
}
