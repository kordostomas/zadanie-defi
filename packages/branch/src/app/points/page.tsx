"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { connectWallet, isMetaMaskAvailable, onAccountChange, onChainChange } from "@/lib/wallet";
import { readLoyaltyBalance, readMemberInfo, readIsMember, getReadProvider, MEMBER_STATUS_LABEL } from "@/lib/contract";
import { BottomNav } from "../page";

// QR code rendered client-side only
const QRCodeSVG = dynamic(() => import("qrcode.react").then(m => m.QRCodeSVG), { ssr: false });

export default function PointsPage() {
  const [address,  setAddress]  = useState<string | null>(null);
  const [balance,  setBalance]  = useState<bigint | null>(null);
  const [info,     setInfo]     = useState<Awaited<ReturnType<typeof readMemberInfo>> | null>(null);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [connErr,  setConnErr]  = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    const unA = onAccountChange(() => window.location.reload());
    const unC = onChainChange(() => window.location.reload());
    return () => { unA(); unC(); };
  }, []);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    const p = getReadProvider() as Parameters<typeof readLoyaltyBalance>[1];
    Promise.all([
      readLoyaltyBalance(address, p),
      readIsMember(address, p),
      readMemberInfo(address, p),
    ])
      .then(([bal, mem, inf]) => { setBalance(bal); setIsMember(mem); setInfo(inf); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  async function handleConnect() {
    setConnErr(null);
    try {
      const r = await connectWallet();
      setAddress(r.address);
    } catch (e) {
      setConnErr(e instanceof Error ? e.message : "Connection failed");
    }
  }

  return (
    <>
      <nav className="topnav">
        <div className="topnav-logo">GymFinder <span>·</span> Points</div>
      </nav>

      <div className="page">
        <div className="hero-sm">
          <h1>My Points</h1>
          <p>Your loyalty balance and check-in QR code.</p>
        </div>

        {/* Connect */}
        {!address && (
          <div className="wallet-card">
            {!isMetaMaskAvailable() && (
              <p className="status error" style={{ marginBottom: "0.75rem" }}>MetaMask not detected.</p>
            )}
            <button className="full" onClick={handleConnect} disabled={!isMetaMaskAvailable()}>
              Connect Wallet
            </button>
            {connErr && <div className="status error">{connErr}</div>}
          </div>
        )}

        {address && loading && <p className="muted" style={{ textAlign: "center", padding: "2rem" }}>Loading…</p>}

        {/* Not a member */}
        {address && !loading && isMember === false && (
          <div className="card">
            <div className="status info" style={{ marginTop: 0 }}>
              You are not a member of this gym yet. <a href="/register">Register here</a>.
            </div>
          </div>
        )}

        {/* Points balance */}
        {address && isMember && balance !== null && (
          <div className="card">
            <div className="card-title">Loyalty Balance</div>
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <div style={{ fontSize: "3.5rem", fontWeight: 900, color: "#e60f0f", lineHeight: 1 }}>
                {balance.toString()}
              </div>
              <div className="muted" style={{ marginTop: "0.3rem" }}>GFP points</div>
            </div>
          </div>
        )}

        {/* Stats */}
        {address && info && (
          <div className="card">
            <div className="card-title">My Stats</div>
            <div className="stat-row">
              <div className="stat-item">
                <div className="stat-label">Total Visits</div>
                <div className="stat-value" style={{ fontSize: "1.3rem" }}>{info.visits.toString()}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Points Earned</div>
                <div className="stat-value" style={{ fontSize: "1.3rem" }}>{info.pointsEarned.toString()}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Points Spent</div>
                <div className="stat-value" style={{ fontSize: "1.3rem" }}>{info.pointsSpent.toString()}</div>
              </div>
            </div>
            {info.status !== 0 && (
              <div style={{ marginTop: "0.75rem" }}>
                <span className={`badge ${info.status === 2 ? "red" : "gray"}`}>
                  {MEMBER_STATUS_LABEL[info.status]}
                </span>
              </div>
            )}
          </div>
        )}

        {/* QR code for check-in */}
        {address && isMember && (
          <div className="card">
            <div className="card-title">Check-In QR Code</div>
            <p className="muted" style={{ fontSize: "0.83rem", marginBottom: "1rem" }}>
              Show this QR code to the gym operator to check in and earn points.
            </p>
            <div className="qr-wrap">
              <QRCodeSVG
                value={address}
                size={200}
                level="M"
                style={{ border: "4px solid white", borderRadius: "8px" }}
              />
            </div>
            <div className="qr-hint">{address}</div>
          </div>
        )}
      </div>

      <BottomNav active="points" />
    </>
  );
}
