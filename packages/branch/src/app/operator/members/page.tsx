"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readMembers, readLoyaltyBalance, readMemberInfo, getReadProvider, MEMBER_STATUS_LABEL } from "@/lib/contract";

interface MemberRow {
  address:     string;
  visits:      bigint;
  balance:     bigint;
  status:      number;
  lastCheckIn: bigint;
}

export default function MembersPage() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const router = useRouter();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const p   = getReadProvider() as Parameters<typeof readMembers>[0];
        const addrs = await readMembers(p);
        const rows = await Promise.all(addrs.map(async addr => {
          const [bal, info] = await Promise.all([
            readLoyaltyBalance(addr, p),
            readMemberInfo(addr, p),
          ]);
          return { address: addr, visits: info.visits, balance: bal, status: info.status, lastCheckIn: info.lastCheckIn };
        }));
        setMembers(rows);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/login", { method: "DELETE" });
    router.push("/operator/login");
  }

  const filtered = search
    ? members.filter(m => m.address.toLowerCase().includes(search.toLowerCase()))
    : members;

  return (
    <>
      <nav className="topnav">
        <div className="topnav-logo">GymFinder <span>·</span> Members</div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link href="/operator/scanner" style={{ fontSize: "0.82rem", color: "#888", textDecoration: "none" }}>Scanner</Link>
          <button className="sm secondary" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="page-wide">
        <div className="hero-sm">
          <h1>Member List</h1>
          <p>{members.length} registered members</p>
        </div>

        <div className="field" style={{ marginBottom: "1rem" }}>
          <label>Search by address</label>
          <input
            type="text"
            placeholder="0x…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading && <p className="muted" style={{ textAlign: "center", padding: "2rem" }}>Loading members…</p>}

        {!loading && filtered.length === 0 && (
          <div className="card">
            <p className="muted" style={{ textAlign: "center" }}>
              {search ? "No members match the search." : "No members registered yet."}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="card" style={{ padding: "0 0 0.5rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Address", "Visits", "Balance", "Status", "Last Check-In"].map(h => (
                    <th key={h} style={{
                      fontSize: "0.67rem", fontWeight: 700, color: "#888",
                      textTransform: "uppercase", letterSpacing: "0.05em",
                      padding: "0.75rem 1rem 0.6rem",
                      textAlign: "left", borderBottom: "2px solid #e5e5e5",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.address}>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #f0f0f0" }}>
                      <div className="address" style={{ fontSize: "0.78rem" }}>
                        {m.address.slice(0, 10)}…{m.address.slice(-8)}
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #f0f0f0", fontVariantNumeric: "tabular-nums" }}>
                      {m.visits.toString()}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #f0f0f0", fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: "#e60f0f", fontWeight: 700 }}>{m.balance.toString()}</span> pts
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #f0f0f0" }}>
                      <span className={`badge ${m.status === 0 ? "green" : m.status === 2 ? "red" : "gray"}`}>
                        {MEMBER_STATUS_LABEL[m.status]}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #f0f0f0", color: "#888", fontSize: "0.82rem" }}>
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
      </div>
    </>
  );
}
