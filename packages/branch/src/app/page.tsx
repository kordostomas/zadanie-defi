"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "ethers";
import { GymInfo, readGymInfo, getReadProvider } from "@/lib/contract";
import { BottomNav } from "@/components/BottomNav";

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
