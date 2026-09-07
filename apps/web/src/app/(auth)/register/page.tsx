"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { register } from "../../../lib/api/auth";

export default function RegisterPage() {
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      window.location.href = "/";
    } catch (err: any) {
      setError(err?.message || "Failed to register. Please try again.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 4px 0", color: "#ffffff", letterSpacing: "-0.3px" }}>
          Create Organization
        </h2>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8" }}>
          Provision an isolated tenant workspace with policy enforcement.
        </p>
      </div>

      {error && (
        <div className="alertBanner" role="alert">
          <div className="alertIcon">!</div>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: "1rem", padding: "0 4px" }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Organization Name */}
      <div className="formGroup">
        <label className="formLabel" htmlFor="org-name-input">
          Organization Name
        </label>
        <div className="inputWrapper">
          <svg className="inputIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
            <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
            <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
            <path d="M10 6h4" />
            <path d="M10 10h4" />
            <path d="M10 14h4" />
            <path d="M10 18h4" />
          </svg>
          <input
            id="org-name-input"
            type="text"
            className="formInputWithIcon"
            placeholder="e.g. Acme AI Systems"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            required
            disabled={loading}
          />
        </div>
      </div>

      {/* Email Address */}
      <div className="formGroup">
        <label className="formLabel" htmlFor="email-input">
          Work Email Address
        </label>
        <div className="inputWrapper">
          <svg className="inputIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <input
            id="email-input"
            type="email"
            className="formInputWithIcon"
            placeholder="admin@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={loading}
          />
        </div>
      </div>

      {/* Password */}
      <div className="formGroup">
        <div className="formLabel">
          <label htmlFor="password-input">Master Password</label>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: "normal" }}>Min. 8 characters</span>
        </div>
        <div className="inputWrapper">
          <svg className="inputIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <input
            id="password-input"
            type={showPassword ? "text" : "password"}
            className="formInputWithIcon"
            style={{ paddingRight: "42px" }}
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={loading}
          />
          <button
            type="button"
            className="visibilityToggleBtn"
            onClick={() => setShowPassword(!showPassword)}
            title={showPassword ? "Hide password" : "Show password"}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" x2="22" y1="2" y2="22" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Submit Button */}
      <button type="submit" className="authButton" disabled={loading}>
        {loading ? (
          <>
            <div className="spinner" />
            <span>Creating Workspace...</span>
          </>
        ) : (
          <>
            <span>Create Organization &amp; Continue</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </>
        )}
      </button>

      <div className="authFooter">
        Already have an organization?{" "}
        <Link href="/login" className="authLink">
          Sign In
        </Link>
      </div>

      <div className="securityNote">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <span>Automatic Owner Provisioning &amp; Ledger Initialization</span>
      </div>
    </form>
  );
}
