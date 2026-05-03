"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "ethers";
import { GymInfo, readGymInfo, getReadProvider } from "@/lib/contract";

const BRANCH_NAME = process.env.NEXT_PUBLIC_BRANCH_NAME ?? "GymFinder";

export default function HomePage() {
  const [gym,     setGym]     = useState<GymInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readGymInfo(getReadProvider() as Parameters<typeof readGymInfo>[0])
      .then(setGym)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);


  return (
    <>
      <nav className="topnav">
        <div className="topnav-logo">GymFinder <span>·</span> <span style={{ color: "#111", fontWeight: 700 }}>{BRANCH_NAME}</span></div>
        <div className="topnav-gym" style={{ fontSize: "0.72rem" }}>
          {gym?.isActive && gym.subscriptionOk
            ? <span className="badge green">Active</span>
            : gym && !gym.subscriptionOk
              ? <span className="badge red">Sub expired</span>
              : null
          }
        </div>
      </nav>

      <div className="page">
        {/* ── Hero ── */}
        <div className="hero-sm" style={{ paddingBottom: "1.5rem" }}>
          <h1>{loading ? "Loading…" : gym?.name ?? BRANCH_NAME}</h1>
          <p>Check in. Earn points. Redeem rewards.</p>
        </div>

        {/* ── Quick nav cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <Link href="/register" style={{ textDecoration: "none" }}>
            <div className="card" style={{ padding: "1.1rem", textAlign: "center", cursor: "pointer", height: "100%" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.4rem" }}>🏋️</div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>Join</div>
              <div className="muted" style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>Register as member</div>
            </div>
          </Link>
          <Link href="/points" style={{ textDecoration: "none" }}>
            <div className="card" style={{ padding: "1.1rem", textAlign: "center", cursor: "pointer", height: "100%" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.4rem" }}>⭐</div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>My Points</div>
              <div className="muted" style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>Balance & QR code</div>
            </div>
          </Link>
          <Link href="/shop" style={{ textDecoration: "none" }}>
            <div className="card" style={{ padding: "1.1rem", textAlign: "center", cursor: "pointer", height: "100%" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.4rem" }}>🛒</div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>Shop</div>
              <div className="muted" style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>Redeem rewards</div>
            </div>
          </Link>
          <Link href="/operator/login" style={{ textDecoration: "none" }}>
            <div className="card" style={{ padding: "1.1rem", textAlign: "center", cursor: "pointer", height: "100%" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.4rem" }}>📷</div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>Operator</div>
              <div className="muted" style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>Scanner & members</div>
            </div>
          </Link>
        </div>

        {/* ── Gym info ── */}
        {gym && (
          <div className="card">
            <div className="card-title">Gym Info</div>
            <div className="stat-row">
              <div className="stat-item">
                <div className="stat-label">Points / Visit</div>
                <div className="stat-value" style={{ fontSize: "1.3rem" }}>{gym.pointsPerVisit.toString()}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Monthly Fee</div>
                <div className="stat-value" style={{ fontSize: "1.3rem" }}>{formatEther(gym.monthlyFee)} ETH</div>
              </div>
            </div>
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <span className={`badge ${gym.isActive && gym.subscriptionOk ? "green" : "red"}`}>
                {!gym.isActive ? "Inactive" : gym.subscriptionOk ? "Subscription Active" : "Subscription Expired"}
              </span>
              {gym.selfReg && <span className="badge blue">Self-registration on</span>}
            </div>
            <div style={{ marginTop: "0.75rem" }}>
              <div className="stat-label" style={{ marginBottom: "0.15rem" }}>Contract</div>
              <div className="address" style={{ fontSize: "0.72rem" }}>{gym.address}</div>
            </div>
          </div>
        )}

        {/* ── Manage link (for gym owner) ── */}
        <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
          <Link href="/manage" style={{ fontSize: "0.8rem", color: "#888" }}>Gym owner management →</Link>
        </div>
      </div>

      <BottomNav active="home" />
    </>
  );
}

export function BottomNav({ active }: { active: "home" | "points" | "shop" | "register" | "operator" }) {
  return (
    <nav className="bottomnav">
      <Link href="/" className={active === "home" ? "active" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Home
      </Link>
      <Link href="/points" className={active === "points" ? "active" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        Points
      </Link>
      <Link href="/shop" className={active === "shop" ? "active" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        Shop
      </Link>
      <Link href="/register" className={active === "register" ? "active" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Join
      </Link>
      <Link href="/operator/login" className={active === "operator" ? "active" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Operator
      </Link>
    </nav>
  );
}
