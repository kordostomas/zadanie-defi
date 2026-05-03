"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  readMembers, readLoyaltyBalance, readMemberInfo, readGymInfo,
  readRedemptions, getReadProvider,
  MEMBER_STATUS_LABEL, PRODUCT_TYPE_LABEL,
  type RedemptionEvent,
} from "@/lib/contract";
import { BottomNav } from "../../page";

interface MemberRow {
  address:     string;
  visits:      bigint;
  balance:     bigint;
  status:      number;
  lastCheckIn: bigint;
  redeemed:    number;
}

type Tab = "members" | "redemptions";

export default function MembersPage() {
  const [members,     setMembers]     = useState<MemberRow[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionEvent[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [tab,         setTab]         = useState<Tab>("members");
  const router = useRouter();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const p    = getReadProvider() as Parameters<typeof readMembers>[0];
        const info = await readGymInfo(p);

        const [addrs, redemptionEvents] = await Promise.all([
          readMembers(p),
          readRedemptions(info.shopProduct, p),
        ]);

        const redemptionCount = new Map<string, number>();
        for (const r of redemptionEvents) {
          redemptionCount.set(r.user.toLowerCase(), (redemptionCount.get(r.user.toLowerCase()) ?? 0) + 1);
        }

        const rows = await Promise.all(addrs.map(async addr => {
          const [bal, mi] = await Promise.all([
            readLoyaltyBalance(addr, p),
            readMemberInfo(addr, p),
          ]);
          return {
            address:     addr,
            visits:      mi.visits,
            balance:     bal,
            status:      mi.status,
            lastCheckIn: mi.lastCheckIn,
            redeemed:    redemptionCount.get(addr.toLowerCase()) ?? 0,
          };
        }));

        setMembers(rows);
        setRedemptions(redemptionEvents);
      } catch { /* ignore read failures */ }
      setLoading(false);
    })();
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/login", { method: "DELETE" });
    router.push("/operator/login");
  }

  const filteredMembers = search
    ? members.filter(m => m.address.toLowerCase().includes(search.toLowerCase()))
    : members;

  const filteredRedemptions = search
    ? redemptions.filter(r => r.user.toLowerCase().includes(search.toLowerCase()))
    : redemptions;

  const thStyle: React.CSSProperties = {
    fontSize: "0.67rem", fontWeight: 700, color: "#888",
    textTransform: "uppercase", letterSpacing: "0.05em",
    padding: "0.75rem 1rem 0.6rem",
    textAlign: "left", borderBottom: "2px solid #e5e5e5",
  };
  const tdStyle: React.CSSProperties = {
    padding: "0.75rem 1rem", borderBottom: "1px solid #f0f0f0",
  };

  return (
    <>
      <nav className="topnav">
        <div className="topnav-logo">GymFinder <span>·</span> Operator</div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Link href="/operator/scanner">
            <button className="sm secondary">Scanner</button>
          </Link>
          <button className="sm secondary" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="page-wide">
        <div className="hero-sm">
          <h1>Operator Panel</h1>
          <p>{members.length} members · {redemptions.length} redemptions</p>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: "0", marginBottom: "1.25rem", borderBottom: "2px solid #e5e5e5" }}>
          {(["members", "redemptions"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                appearance: "none", WebkitAppearance: "none",
                background: tab === t ? "#fff8f8" : "transparent",
                border: "none",
                borderBottom: tab === t ? "2px solid #e60f0f" : "2px solid transparent",
                borderRadius: "4px 4px 0 0",
                cursor: "pointer",
                padding: "0.55rem 1.25rem 0.6rem",
                marginBottom: "-2px",
                fontSize: "0.88rem",
                fontWeight: tab === t ? 700 : 500,
                color: tab === t ? "#e60f0f" : "#555",
                letterSpacing: "0.01em",
                transition: "color 0.15s, background 0.15s",
              }}
            >
              {t === "members" ? `Members (${members.length})` : `Redemptions (${redemptions.length})`}
            </button>
          ))}
        </div>

        {/* ── Search ── */}
        <div className="field" style={{ marginBottom: "1rem" }}>
          <label>Filter by address</label>
          <input
            type="text"
            placeholder="0x…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading && <p className="muted" style={{ textAlign: "center", padding: "2rem" }}>Loading…</p>}

        {/* ── Members tab ── */}
        {!loading && tab === "members" && (
          <>
            {filteredMembers.length === 0 ? (
              <div className="card">
                <p className="muted" style={{ textAlign: "center" }}>
                  {search ? "No members match the filter." : "No members registered yet."}
                </p>
              </div>
            ) : (
              <div className="card" style={{ padding: "0 0 0.5rem", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Address", "Visits", "Balance", "Redeemed", "Status", "Last Check-In"].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map(m => (
                      <tr key={m.address}>
                        <td style={tdStyle}>
                          <div className="address" style={{ fontSize: "0.78rem" }}>
                            {m.address.slice(0, 10)}…{m.address.slice(-8)}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                          {m.visits.toString()}
                        </td>
                        <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                          <span style={{ color: "#e60f0f", fontWeight: 700 }}>{m.balance.toString()}</span> pts
                        </td>
                        <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                          {m.redeemed > 0
                            ? <span style={{ fontWeight: 600 }}>{m.redeemed}</span>
                            : <span className="muted">—</span>
                          }
                        </td>
                        <td style={tdStyle}>
                          <span className={`badge ${m.status === 0 ? "green" : m.status === 2 ? "red" : "gray"}`}>
                            {MEMBER_STATUS_LABEL[m.status]}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: "#888", fontSize: "0.82rem" }}>
                          {m.lastCheckIn > 0n
                            ? new Date(Number(m.lastCheckIn) * 1000).toLocaleString()
                            : "Never"
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Redemptions tab ── */}
        {!loading && tab === "redemptions" && (
          <>
            {filteredRedemptions.length === 0 ? (
              <div className="card">
                <p className="muted" style={{ textAlign: "center" }}>
                  {search ? "No redemptions match the filter." : "No products redeemed yet."}
                </p>
              </div>
            ) : (
              <div className="card" style={{ padding: "0 0 0.5rem", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Member", "Product", "Type", "Points Burned", "Tx"].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRedemptions.map((r, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>
                          <div className="address" style={{ fontSize: "0.78rem" }}>
                            {r.user.slice(0, 10)}…{r.user.slice(-8)}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>
                          {r.productName}
                        </td>
                        <td style={tdStyle}>
                          <span className="badge gray">
                            {PRODUCT_TYPE_LABEL[r.productType] ?? "—"}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                          <span style={{ color: "#e60f0f", fontWeight: 700 }}>{r.pointsBurned.toString()}</span> pts
                        </td>
                        <td style={{ ...tdStyle, fontSize: "0.78rem" }}>
                          {r.txHash
                            ? <a
                                href={`https://sepolia.etherscan.io/tx/${r.txHash}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ color: "#888" }}
                              >
                                {r.txHash.slice(0, 8)}…
                              </a>
                            : "—"
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav active="operator" />
    </>
  );
}
