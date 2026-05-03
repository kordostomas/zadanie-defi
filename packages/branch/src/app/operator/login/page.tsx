"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";

const PIN_LENGTH = 4;

export default function OperatorLoginPage() {
  const [digits,  setDigits]  = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const refs = Array.from({ length: PIN_LENGTH }, () => useRef<HTMLInputElement>(null));
  const router = useRouter();

  function handleDigit(idx: number, val: string) {
    const d = val.replace(/\D/, "").slice(-1);
    const next = [...digits];
    next[idx] = d;
    setDigits(next);
    if (d && idx < PIN_LENGTH - 1) refs[idx + 1].current?.focus();
    if (!d && idx > 0) refs[idx - 1].current?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      refs[idx - 1].current?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pin = digits.join("");
    if (pin.length !== PIN_LENGTH) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.push("/operator/scanner");
      } else {
        const { error: msg } = await res.json();
        setError(msg ?? "Invalid PIN");
        setDigits(Array(PIN_LENGTH).fill(""));
        refs[0].current?.focus();
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  return (
    <>
      <nav className="topnav">
        <div className="topnav-logo">GymFinder <span>·</span> Operator</div>
      </nav>

      <div className="page" style={{ maxWidth: 360 }}>
        <div className="hero-sm" style={{ textAlign: "center" }}>
          <h1>Operator Login</h1>
          <p>Enter your 4-digit PIN to access the scanner.</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="pin-wrap">
              {refs.map((ref, i) => (
                <input
                  key={i}
                  ref={ref}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digits[i]}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {error && <div className="status error">{error}</div>}
            <button
              type="submit"
              className="full"
              disabled={digits.join("").length !== PIN_LENGTH || loading}
            >
              {loading ? "Verifying…" : "Enter"}
            </button>
          </form>
        </div>

        <p className="muted" style={{ textAlign: "center", fontSize: "0.78rem", marginTop: "1rem" }}>
          PIN is set by the gym administrator via the <code>.env</code> file.
        </p>
      </div>

      <BottomNav active="operator" />
    </>
  );
}
