"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";

type ScanState = "idle" | "scanning" | "submitting" | "success" | "error";

export default function ScannerPage() {
  const [scanState,  setScanState]  = useState<ScanState>("idle");
  const isProcessing = scanState === "submitting" || scanState === "scanning";
  const [lastAddr,   setLastAddr]   = useState<string | null>(null);
  const [txHash,     setTxHash]     = useState<string | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [manualAddr, setManualAddr] = useState("");
  const [showManual, setShowManual] = useState(false);
  const scannerRef = useRef<unknown>(null);
  const router = useRouter();

  const processAddress = useCallback(async (addr: string) => {
    if (scanState === "submitting") return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setErrorMsg("Invalid Ethereum address scanned");
      setScanState("error");
      return;
    }
    setLastAddr(addr);
    setScanState("submitting");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/scanner/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberAddress: addr }),
      });
      const data = await res.json();
      if (res.ok) {
        setTxHash(data.txHash ?? null);
        setScanState("success");
      } else {
        setErrorMsg(data.error ?? "Check-in failed");
        setScanState("error");
      }
    } catch {
      setErrorMsg("Network error");
      setScanState("error");
    }
  }, [scanState]);

  // Start QR scanner
  useEffect(() => {
    if (scanState !== "scanning") return;
    let mounted = true;
    let scanner: { clear: () => Promise<void> } | null = null;

    (async () => {
      const { Html5QrcodeScanner } = await import("html5-qrcode");
      if (!mounted) return;
      scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 280, height: 280 }, rememberLastUsedCamera: true },
        false
      ) as { clear: () => Promise<void> };
      (scanner as unknown as { render: (a: (t: string) => void, b: () => void) => void }).render(
        (decoded: string) => { processAddress(decoded); },
        () => { /* scan error, ignore */ }
      );
    })();

    return () => {
      mounted = false;
      scanner?.clear().catch(() => {});
    };
  }, [scanState, processAddress]);

  async function handleLogout() {
    await fetch("/api/auth/login", { method: "DELETE" });
    router.push("/operator/login");
  }

  function reset() {
    setScanState("idle");
    setLastAddr(null);
    setTxHash(null);
    setErrorMsg(null);
    setManualAddr("");
  }

  return (
    <>
      <nav className="topnav">
        <div className="topnav-logo">GymFinder <span>·</span> Scanner</div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Link href="/operator/members">
            <button className="sm secondary">Members</button>
          </Link>
          <button className="sm secondary" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="page" style={{ maxWidth: 440 }}>
        <div className="hero-sm">
          <h1>Check-In Scanner</h1>
          <p>Scan a member&apos;s wallet QR code to check them in.</p>
        </div>

        {/* Idle / result state */}
        {scanState === "idle" && (
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📷</div>
            <button className="full" onClick={() => setScanState("scanning")}>
              Start Camera Scanner
            </button>
            <button
              className="full secondary"
              style={{ marginTop: "0.5rem" }}
              onClick={() => setShowManual(v => !v)}
            >
              {showManual ? "Hide" : "Enter Address Manually"}
            </button>
            {showManual && (
              <div style={{ marginTop: "1rem", textAlign: "left" }}>
                <div className="field">
                  <label>Member wallet address</label>
                  <input
                    type="text"
                    placeholder="0x…"
                    value={manualAddr}
                    onChange={e => setManualAddr(e.target.value)}
                  />
                </div>
                <button
                  className="full"
                  onClick={() => processAddress(manualAddr)}
                  disabled={!manualAddr || isProcessing}
                >
                  Check In
                </button>
              </div>
            )}
          </div>
        )}

        {/* Camera scanner */}
        {scanState === "scanning" && (
          <div className="card">
            <div className="scanner-wrap" id="qr-reader" />
            <button className="full secondary" style={{ marginTop: "0.75rem" }} onClick={() => setScanState("idle")}>
              Cancel
            </button>
          </div>
        )}

        {/* Submitting */}
        {scanState === "submitting" && (
          <div className="card" style={{ textAlign: "center", padding: "2.5rem 1.25rem" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>⏳</div>
            <div style={{ fontWeight: 700 }}>Processing check-in…</div>
            <div className="muted" style={{ fontSize: "0.83rem", marginTop: "0.5rem" }}>{lastAddr}</div>
          </div>
        )}

        {/* Success */}
        {scanState === "success" && (
          <div className="card" style={{ textAlign: "center", padding: "2.5rem 1.25rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: "1.3rem", color: "#16a34a" }}>Check-In Confirmed!</div>
            <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>{lastAddr}</div>
            {txHash && (
              <div className="address" style={{ marginTop: "0.5rem", fontSize: "0.72rem" }}>
                tx: {txHash.slice(0, 16)}…
              </div>
            )}
            <button className="full" style={{ marginTop: "1.25rem" }} onClick={reset}>
              Scan Next Member
            </button>
          </div>
        )}

        {/* Error */}
        {scanState === "error" && (
          <div className="card" style={{ textAlign: "center", padding: "2rem 1.25rem" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>❌</div>
            <div style={{ fontWeight: 700, color: "#e60f0f" }}>Check-In Failed</div>
            {lastAddr && <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>{lastAddr}</div>}
            <div className="status error" style={{ textAlign: "left", marginTop: "0.75rem" }}>
              {errorMsg}
            </div>
            <button className="full" style={{ marginTop: "1rem" }} onClick={reset}>
              Try Again
            </button>
          </div>
        )}
      </div>

      <BottomNav active="operator" />
    </>
  );
}
