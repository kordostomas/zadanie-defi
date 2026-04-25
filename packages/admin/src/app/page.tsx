"use client";

import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, JsonRpcProvider, JsonRpcSigner, formatEther, parseEther } from "ethers";
import {
  FACTORY_ADDRESS,
  ETHERSCAN_BASE,
  GymInfo,
  getFactory,
  readAllGyms,
  readGymInfo,
  readFactoryOwner,
  readPlatformFeePercent,
  readAccumulatedTreasuryFees,
} from "@/lib/contract";
import { connectWallet, isMetaMaskAvailable, onAccountChange, onChainChange } from "@/lib/wallet";
import { useTx } from "@/lib/useTx";

const CHAIN_ID_NUM = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337", 10);
const RPC_FALLBACK = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

function getReadProvider(): BrowserProvider | JsonRpcProvider {
  if (typeof window !== "undefined" && window.ethereum) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new BrowserProvider(window.ethereum as any);
  }
  return new JsonRpcProvider(RPC_FALLBACK);
}

// ── Types ──────────────────────────────────────────────────────────────────

interface PlatformData {
  owner:       string;
  feePercent:  bigint;
  pendingFees: bigint;
  regFee:      bigint;
  gyms:        GymInfo[];
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [signer,   setSigner]   = useState<JsonRpcSigner | null>(null);
  const [address,  setAddress]  = useState<string | null>(null);
  const [platform, setPlatform] = useState<PlatformData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [connErr,  setConnErr]  = useState<string | null>(null);

  // Admin forms
  const [newFee,     setNewFee]     = useState("");
  const [newRegFee,  setNewRegFee]  = useState("");
  const [gymName,    setGymName]    = useState("");
  const [gymOwner,   setGymOwner]   = useState("");
  const [gymMonthly, setGymMonthly] = useState("0.01");
  const [gymPoints,  setGymPoints]  = useState("100");

  const collectTx   = useTx();
  const updateFeeTx = useTx();
  const updateRegTx = useTx();
  const deployTx    = useTx();

  const isAdmin = !!(address && platform && address.toLowerCase() === platform.owner.toLowerCase());

  // ── Load platform ─────────────────────────────────────────────────────────

  const loadPlatform = useCallback(async () => {
    setLoading(true);
    try {
      const p = getReadProvider();
      const [owner, fee, gymAddrs, pending] = await Promise.all([
        readFactoryOwner(p),
        readPlatformFeePercent(p),
        readAllGyms(p),
        readAccumulatedTreasuryFees(p),
      ]);
      const factory = getFactory(p);
      const regFee  = await factory.registrationFee() as bigint;
      const gymInfos = await Promise.all(gymAddrs.map(a => readGymInfo(a, p)));
      setPlatform({ owner, feePercent: fee, pendingFees: pending, regFee, gyms: gymInfos });
    } catch { /* ignore read failures */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadPlatform(); }, [loadPlatform]);

  const anyMined = [collectTx, updateFeeTx, updateRegTx, deployTx].some(t => t.state.status === "mined");
  useEffect(() => { if (anyMined) loadPlatform(); }, [anyMined, loadPlatform]);

  useEffect(() => {
    const unA = onAccountChange(() => window.location.reload());
    const unC = onChainChange(() => window.location.reload());
    return () => { unA(); unC(); };
  }, []);

  // ── Connect ───────────────────────────────────────────────────────────────

  async function handleConnect() {
    setConnErr(null);
    try {
      const r = await connectWallet();
      setSigner(r.signer);
      setAddress(r.address);
    } catch (e) {
      setConnErr(e instanceof Error ? e.message : "Connection failed");
    }
  }

  // ── Admin actions ─────────────────────────────────────────────────────────

  async function handleCollect() {
    if (!signer) return;
    const f = getFactory(signer);
    await collectTx.send(() => f.collectPlatformFees() as ReturnType<typeof f.collectPlatformFees>);
  }

  async function handleUpdateFee() {
    if (!signer || !newFee) return;
    const f = getFactory(signer);
    await updateFeeTx.send(() => f.updateFeePercent(BigInt(newFee)) as ReturnType<typeof f.updateFeePercent>);
    setNewFee("");
  }

  async function handleUpdateRegFee() {
    if (!signer || !newRegFee) return;
    const f = getFactory(signer);
    await updateRegTx.send(() => f.setRegistrationFee(parseEther(newRegFee)) as ReturnType<typeof f.setRegistrationFee>);
    setNewRegFee("");
  }

  async function handleDeploy() {
    if (!signer || !gymName || !gymOwner) return;
    const f = getFactory(signer);
    await deployTx.send(() =>
      f.deployGymBranch(
        gymName, gymOwner, parseEther(gymMonthly), BigInt(gymPoints),
        { value: platform?.regFee ?? 0n }
      ) as ReturnType<typeof f.deployGymBranch>
    );
    setGymName(""); setGymOwner(""); setGymMonthly("0.01"); setGymPoints("100");
  }

  const explorerTx   = (h: string) => ETHERSCAN_BASE ? `${ETHERSCAN_BASE}/tx/${h}` : null;
  const explorerAddr = (a: string) => ETHERSCAN_BASE ? `${ETHERSCAN_BASE}/address/${a}` : null;

  const networkName =
    CHAIN_ID_NUM === 31337 ? "Hardhat Local" :
    CHAIN_ID_NUM === 11155111 ? "Sepolia" :
    `Chain ${CHAIN_ID_NUM}`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="navbar-logo">GymFinder <span>Admin</span></div>
        <div className="navbar-right">
          {address ? (
            <>
              {isAdmin && <span className="badge red">Platform Owner</span>}
              <span className="navbar-addr">{address.slice(0, 6)}…{address.slice(-4)}</span>
            </>
          ) : (
            <button className="sm secondary" onClick={handleConnect} disabled={!isMetaMaskAvailable()}>
              Connect Wallet
            </button>
          )}
        </div>
      </nav>

      <div className="container">
        {/* ── Hero ── */}
        <div className="hero">
          <h1>Platform Dashboard</h1>
          <p>Manage GymFinder branches, fees, and treasury · {networkName}</p>
        </div>

        {connErr && <div className="status error" style={{ marginBottom: "1rem" }}>{connErr}</div>}

        {!address && (
          <div className="card" style={{ textAlign: "center", padding: "2.5rem 1.5rem", marginBottom: "1.5rem" }}>
            <p className="muted" style={{ marginBottom: "1rem" }}>
              Connect the platform owner wallet to access admin controls.
              {!isMetaMaskAvailable() && " MetaMask not detected — please install it."}
            </p>
            <button onClick={handleConnect} disabled={!isMetaMaskAvailable()}>
              Connect MetaMask
            </button>
          </div>
        )}

        {/* ── Stats ── */}
        {!loading && platform && (
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Total Branches</div>
              <div className="stat-value">{platform.gyms.length}</div>
              <div className="stat-sub">registered gyms</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Platform Fee</div>
              <div className="stat-value">{platform.feePercent.toString()}%</div>
              <div className="stat-sub">of monthly subscriptions</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Treasury Pending</div>
              <div className="stat-value" style={{ fontSize: "1.6rem" }}>{formatEther(platform.pendingFees)}</div>
              <div className="stat-sub">ETH to collect</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Registration Fee</div>
              <div className="stat-value" style={{ fontSize: "1.6rem" }}>{formatEther(platform.regFee)}</div>
              <div className="stat-sub">ETH per new branch</div>
            </div>
          </div>
        )}

        {loading && <p className="muted" style={{ marginBottom: "2rem" }}>Loading platform data…</p>}

        {/* ── Admin controls (owner only) ── */}
        {isAdmin && platform && (
          <div className="section">
            <div className="section-header">
              <span className="section-title">Platform Controls</span>
              <span className="muted" style={{ fontSize: "0.8rem" }}>Owner only</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>

              <div className="card">
                <div className="card-title">Collect Treasury</div>
                <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
                  Withdraw accumulated platform fees from the splitter contract.
                </p>
                <button
                  className="full"
                  onClick={handleCollect}
                  disabled={platform.pendingFees === 0n || collectTx.state.status === "pending"}
                >
                  {collectTx.state.status === "pending" ? "Sending…" : `Collect ${formatEther(platform.pendingFees)} ETH`}
                </button>
                <TxFeedback state={collectTx.state} explorerFn={explorerTx} />
              </div>

              <div className="card">
                <div className="card-title">Platform Fee</div>
                <div className="field">
                  <label>New percentage (0–100)</label>
                  <input
                    type="number" min="0" max="100"
                    placeholder={`Current: ${platform.feePercent}%`}
                    value={newFee} onChange={e => setNewFee(e.target.value)}
                  />
                </div>
                <button
                  className="full"
                  onClick={handleUpdateFee}
                  disabled={!newFee || updateFeeTx.state.status === "pending"}
                >
                  {updateFeeTx.state.status === "pending" ? "Sending…" : "Update Fee"}
                </button>
                <TxFeedback state={updateFeeTx.state} explorerFn={explorerTx} />
              </div>

              <div className="card">
                <div className="card-title">Registration Fee</div>
                <div className="field">
                  <label>New fee in ETH</label>
                  <input
                    type="number" min="0" step="0.001"
                    placeholder={`Current: ${formatEther(platform.regFee)} ETH`}
                    value={newRegFee} onChange={e => setNewRegFee(e.target.value)}
                  />
                </div>
                <button
                  className="full"
                  onClick={handleUpdateRegFee}
                  disabled={!newRegFee || updateRegTx.state.status === "pending"}
                >
                  {updateRegTx.state.status === "pending" ? "Sending…" : "Update Registration Fee"}
                </button>
                <TxFeedback state={updateRegTx.state} explorerFn={explorerTx} />
              </div>
            </div>
          </div>
        )}

        {/* ── Deploy branch ── */}
        {isAdmin && (
          <div className="section">
            <div className="section-header">
              <span className="section-title">Deploy New Branch</span>
            </div>
            <div className="card">
              <div className="row">
                <div className="field">
                  <label>Gym name</label>
                  <input type="text" placeholder="Iron Palace" value={gymName} onChange={e => setGymName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Owner address</label>
                  <input type="text" placeholder="0x…" value={gymOwner} onChange={e => setGymOwner(e.target.value)} />
                </div>
              </div>
              <div className="row" style={{ marginTop: "0.5rem" }}>
                <div className="field">
                  <label>Monthly fee (ETH)</label>
                  <input type="number" min="0" step="0.001" value={gymMonthly} onChange={e => setGymMonthly(e.target.value)} />
                </div>
                <div className="field">
                  <label>Points per visit</label>
                  <input type="number" min="1" value={gymPoints} onChange={e => setGymPoints(e.target.value)} />
                </div>
              </div>
              {platform && platform.regFee > 0n && (
                <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.75rem" }}>
                  Registration fee: {formatEther(platform.regFee)} ETH will be deducted from your wallet.
                </p>
              )}
              <button
                className="full"
                onClick={handleDeploy}
                disabled={!gymName || !gymOwner || deployTx.state.status === "pending"}
              >
                {deployTx.state.status === "pending" ? "Deploying…" : "Deploy Branch"}
              </button>
              <TxFeedback state={deployTx.state} explorerFn={explorerTx} />
            </div>
          </div>
        )}

        {/* ── Branches list ── */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Registered Branches</span>
            {platform && <span className="muted" style={{ fontSize: "0.82rem" }}>{platform.gyms.length} total</span>}
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {loading && !platform && <p className="muted" style={{ padding: "1.5rem" }}>Loading…</p>}
            {!loading && platform?.gyms.length === 0 && (
              <p className="muted" style={{ padding: "1.5rem" }}>No branches deployed yet.</p>
            )}
            {platform && platform.gyms.length > 0 && (
              <div style={{ padding: "0 1.5rem 0.5rem" }}>
                <table className="branch-table">
                  <thead>
                    <tr>
                      <th>Branch</th>
                      <th>Contract Address</th>
                      <th>Owner</th>
                      <th>Monthly Fee</th>
                      <th>Pts / Visit</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platform.gyms.map(gym => (
                      <tr key={gym.address}>
                        <td><div style={{ fontWeight: 700, color: "#111" }}>{gym.name}</div></td>
                        <td>
                          <div className="address">
                            {explorerAddr(gym.address)
                              ? <a href={explorerAddr(gym.address)!} target="_blank" rel="noopener noreferrer">{gym.address.slice(0,10)}…{gym.address.slice(-6)}</a>
                              : <>{gym.address.slice(0,10)}…{gym.address.slice(-6)}</>
                            }
                          </div>
                        </td>
                        <td><div className="address">{gym.owner.slice(0,10)}…{gym.owner.slice(-6)}</div></td>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>{formatEther(gym.monthlyFee)} ETH</td>
                        <td>{gym.pointsPerVisit.toString()}</td>
                        <td>
                          {!gym.isActive
                            ? <span className="badge gray">Inactive</span>
                            : gym.subscriptionOk
                              ? <span className="badge green">Active</span>
                              : <span className="badge red">Expired</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Contract info ── */}
        <div className="section">
          <div className="section-header"><span className="section-title">Contract Info</span></div>
          <div className="card">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <div style={{ fontSize: "0.7rem", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>Factory</div>
                <div className="address">
                  {explorerAddr(FACTORY_ADDRESS)
                    ? <a href={explorerAddr(FACTORY_ADDRESS)!} target="_blank" rel="noopener noreferrer">{FACTORY_ADDRESS}</a>
                    : FACTORY_ADDRESS}
                </div>
              </div>
              {platform && (
                <div>
                  <div style={{ fontSize: "0.7rem", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>Owner</div>
                  <div className="address">
                    {explorerAddr(platform.owner)
                      ? <a href={explorerAddr(platform.owner)!} target="_blank" rel="noopener noreferrer">{platform.owner}</a>
                      : platform.owner}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <footer>GymFinder Loyalty Platform · DMBLOCK Assignment 2</footer>
    </>
  );
}

// ── TxFeedback ─────────────────────────────────────────────────────────────

function TxFeedback({ state, explorerFn }: {
  state: ReturnType<typeof useTx>["state"];
  explorerFn: (h: string) => string | null;
}) {
  if (state.status === "idle") return null;
  if (state.status === "pending") {
    const url = state.hash ? explorerFn(state.hash) : null;
    return (
      <div className="status pending">
        Pending…{url && <> <a href={url} target="_blank" rel="noopener noreferrer">View</a></>}
      </div>
    );
  }
  if (state.status === "mined") {
    const url = state.hash ? explorerFn(state.hash) : null;
    return (
      <div className="status mined">
        Confirmed!{url && <> <a href={url} target="_blank" rel="noopener noreferrer">View</a></>}
      </div>
    );
  }
  return <div className="status error">{state.errorMsg}</div>;
}
