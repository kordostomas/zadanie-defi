"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEther } from "ethers";
import { isMetaMaskAvailable } from "@/lib/wallet";
import { useWallet } from "@/lib/WalletContext";
import {
  GymInfo, ProductInfo,
  readGymInfo, readProducts, readGymOwnerFees,
  getReadProvider, getGymBranch,
  PRODUCT_TYPE_LABEL, ETHERSCAN_BASE,
  SPLITTER_ADDRESS,
} from "@/lib/contract";
import deployment from "@/generated/deployment.json";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SPLITTER_ABI = deployment.PaymentSplitter.abi as any[];
import { Contract } from "ethers";
import { useTx } from "@/lib/useTx";

type Tab = "products" | "operators" | "settings" | "members";

export default function ManagePage() {
  const { signer, address, connect, isConnecting, error: connErr } = useWallet();
  const [gym,       setGym]       = useState<GymInfo | null>(null);
  const [products,  setProducts]  = useState<ProductInfo[]>([]);
  const [ownerFees, setOwnerFees] = useState<bigint>(0n);
  const [isOwner,   setIsOwner]   = useState(false);
  const [tab,       setTab]       = useState<Tab>("products");

  // Form: add product
  const [pName,  setPName]  = useState("");
  const [pDesc,  setPDesc]  = useState("");
  const [pCost,  setPCost]  = useState("");
  const [pType,  setPType]  = useState("0");
  const [pStock, setPStock] = useState("10");

  // Form: award points
  const [aAddr,   setAAddr]   = useState("");
  const [aAmt,    setAAmt]    = useState("");
  const [aReason, setAReason] = useState("");

  // Form: add operator
  const [opAddr, setOpAddr] = useState("");

  // Form: settings
  const [newRate,    setNewRate]    = useState("");
  const [newFee,     setNewFee]     = useState("");
  const [newLimit,   setNewLimit]   = useState("");
  const [selfRegOn,  setSelfRegOn]  = useState(false);

  const addProductTx  = useTx();
  const awardTx       = useTx();
  const addOpTx       = useTx();
  const removeOpTx    = useTx();
  const paySubTx      = useTx();
  const withdrawTx    = useTx();
  const settingsTx    = useTx();
  const statusTx      = useTx();

  const explorerTx = (h: string) => ETHERSCAN_BASE ? `${ETHERSCAN_BASE}/tx/${h}` : null;

  const load = useCallback(async (addr?: string) => {
    try {
      const p = getReadProvider() as Parameters<typeof readGymInfo>[0];
      const g = await readGymInfo(p);
      setGym(g);
      setSelfRegOn(g.selfReg);
      const prods = await readProducts(g.shopProduct, p);
      setProducts(prods);
      if (addr) {
        setIsOwner(g.owner.toLowerCase() === addr.toLowerCase());
        const fees = await readGymOwnerFees(addr, p);
        setOwnerFees(fees);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(address ?? undefined); }, [load, address]);

  const anyMined = [addProductTx, awardTx, addOpTx, removeOpTx, paySubTx, withdrawTx, settingsTx, statusTx]
    .some(t => t.state.status === "mined");
  useEffect(() => { if (anyMined) load(address ?? undefined); }, [anyMined, load, address]);

  async function handleAddProduct() {
    if (!signer || !pName || !pCost) return;
    const c = getGymBranch(signer);
    await addProductTx.send(() =>
      c.addProduct(pName, pDesc, BigInt(pCost), Number(pType), Number(pStock)) as ReturnType<typeof c.addProduct>
    );
    setPName(""); setPDesc(""); setPCost(""); setPStock("10");
  }

  async function handleAward() {
    if (!signer || !aAddr || !aAmt) return;
    const c = getGymBranch(signer);
    await awardTx.send(() => c.awardPoints(aAddr, BigInt(aAmt), aReason) as ReturnType<typeof c.awardPoints>);
    setAAddr(""); setAAmt(""); setAReason("");
  }

  async function handleAddOp() {
    if (!signer || !opAddr) return;
    const c = getGymBranch(signer);
    await addOpTx.send(() => c.addOperator(opAddr) as ReturnType<typeof c.addOperator>);
    setOpAddr("");
  }

  async function handlePaySub() {
    if (!signer || !gym) return;
    const c = getGymBranch(signer);
    await paySubTx.send(() => c.payMonthlyFee({ value: gym.monthlyFee }) as ReturnType<typeof c.payMonthlyFee>);
  }

  async function handleWithdraw() {
    if (!signer) return;
    const splitter = new Contract(SPLITTER_ADDRESS, SPLITTER_ABI, signer);
    await withdrawTx.send(() => splitter.withdrawGymFees() as ReturnType<typeof splitter.withdrawGymFees>);
  }

  async function handleSaveSettings() {
    if (!signer) return;
    const c = getGymBranch(signer);
    if (newRate) {
      await settingsTx.send(() => c.setLoyaltyPointsRate(BigInt(newRate)) as ReturnType<typeof c.setLoyaltyPointsRate>);
      setNewRate("");
    } else if (newLimit) {
      await settingsTx.send(() => c.setCheckInRateLimit(BigInt(newLimit)) as ReturnType<typeof c.setCheckInRateLimit>);
      setNewLimit("");
    } else {
      await settingsTx.send(() => c.setAllowSelfRegistration(selfRegOn) as ReturnType<typeof c.setAllowSelfRegistration>);
    }
  }

  return (
    <>
      <nav className="topnav">
        <div className="topnav-logo">GymFinder <span>·</span> Manage</div>
        {address ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {isOwner && <span className="badge green">Owner</span>}
            <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#888" }}>
              {address.slice(0, 6)}…{address.slice(-4)}
            </span>
          </div>
        ) : (
          <button className="sm secondary" onClick={connect} disabled={!isMetaMaskAvailable() || isConnecting}>
            {isConnecting ? "Connecting…" : "Connect"}
          </button>
        )}
      </nav>

      <div className="page">
        <div className="hero-sm">
          <h1>Gym Management</h1>
          <p>{gym?.name ?? "Branch management dashboard"}</p>
        </div>

        {connErr && <div className="status error">{connErr}</div>}

        {!address && (
          <div className="card" style={{ textAlign: "center" }}>
            <p className="muted" style={{ marginBottom: "1rem" }}>Connect the gym owner wallet to manage this branch.</p>
            <button onClick={connect} disabled={!isMetaMaskAvailable() || isConnecting}>
              {isConnecting ? "Connecting…" : "Connect MetaMask"}
            </button>
          </div>
        )}

        {address && !isOwner && (
          <div className="status error">
            Connected wallet is not the owner of this gym branch.
          </div>
        )}

        {/* Subscription card */}
        {gym && address && isOwner && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <div className="stat-label">Subscription</div>
                <span className={`badge ${gym.subscriptionOk ? "green" : "red"}`}>
                  {gym.subscriptionOk ? "Active" : "Expired"}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {ownerFees > 0n && (
                  <button className="sm secondary" onClick={handleWithdraw} disabled={withdrawTx.state.status === "pending"}>
                    Withdraw {formatEther(ownerFees)} ETH
                  </button>
                )}
                <button className="sm" onClick={handlePaySub} disabled={paySubTx.state.status === "pending"}>
                  Pay {formatEther(gym.monthlyFee)} ETH
                </button>
              </div>
            </div>
            {paySubTx.state.status !== "idle" && (
              <TxFeedback state={paySubTx.state} explorerFn={explorerTx} />
            )}
            {withdrawTx.state.status !== "idle" && (
              <TxFeedback state={withdrawTx.state} explorerFn={explorerTx} />
            )}
          </div>
        )}

        {/* Tab nav */}
        {address && isOwner && (
          <>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", overflowX: "auto" }}>
              {(["products", "operators", "settings", "members"] as Tab[]).map(t => (
                <button
                  key={t}
                  className="sm secondary"
                  style={{ background: tab === t ? "#111" : undefined, color: tab === t ? "#fff" : undefined, borderColor: tab === t ? "#111" : undefined }}
                  onClick={() => setTab(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* Products tab */}
            {tab === "products" && (
              <>
                <div className="card">
                  <div className="card-title">Add Product</div>
                  <div className="row">
                    <div className="field"><label>Name</label><input type="text" placeholder="Protein Shake" value={pName} onChange={e => setPName(e.target.value)} /></div>
                    <div className="field"><label>Description</label><input type="text" placeholder="Short description" value={pDesc} onChange={e => setPDesc(e.target.value)} /></div>
                  </div>
                  <div className="row" style={{ marginTop: "0.5rem" }}>
                    <div className="field"><label>Point cost</label><input type="number" min="1" value={pCost} onChange={e => setPCost(e.target.value)} /></div>
                    <div className="field"><label>Stock</label><input type="number" min="1" value={pStock} onChange={e => setPStock(e.target.value)} /></div>
                    <div className="field">
                      <label>Type</label>
                      <select value={pType} onChange={e => setPType(e.target.value)}>
                        <option value="0">Physical</option>
                        <option value="1">Service</option>
                        <option value="2">Discount</option>
                      </select>
                    </div>
                  </div>
                  <button className="full" onClick={handleAddProduct} disabled={!pName || !pCost || addProductTx.state.status === "pending"}>
                    {addProductTx.state.status === "pending" ? "Adding…" : "Add Product"}
                  </button>
                  <TxFeedback state={addProductTx.state} explorerFn={explorerTx} />
                </div>

                <div className="card">
                  <div className="card-title">Current Products</div>
                  {products.length === 0 && <p className="muted">No products yet.</p>}
                  {products.map(p => (
                    <div key={p.id} className="product-row">
                      <div>
                        <div className="product-name">{p.name}</div>
                        {p.description && <div className="product-desc">{p.description}</div>}
                        <div className="product-meta">
                          <span className="badge gray">{PRODUCT_TYPE_LABEL[p.productType]}</span>
                          <span className="muted" style={{ fontSize: "0.75rem" }}>Stock: {p.stock.toString()}</span>
                          {!p.isActive && <span className="badge red">Inactive</span>}
                        </div>
                      </div>
                      <div className="product-cost">{p.loyaltyPointCost.toString()} pts</div>
                    </div>
                  ))}
                </div>

                <div className="card">
                  <div className="card-title">Award Bonus Points</div>
                  <div className="field"><label>Member address</label><input type="text" placeholder="0x…" value={aAddr} onChange={e => setAAddr(e.target.value)} /></div>
                  <div className="row">
                    <div className="field"><label>Points</label><input type="number" min="1" value={aAmt} onChange={e => setAAmt(e.target.value)} /></div>
                    <div className="field"><label>Reason</label><input type="text" placeholder="Referral, birthday…" value={aReason} onChange={e => setAReason(e.target.value)} /></div>
                  </div>
                  <button className="full" onClick={handleAward} disabled={!aAddr || !aAmt || awardTx.state.status === "pending"}>
                    {awardTx.state.status === "pending" ? "Sending…" : "Award Points"}
                  </button>
                  <TxFeedback state={awardTx.state} explorerFn={explorerTx} />
                </div>
              </>
            )}

            {/* Operators tab */}
            {tab === "operators" && (
              <div className="card">
                <div className="card-title">Add Operator</div>
                <p className="muted" style={{ fontSize: "0.83rem", marginBottom: "0.75rem" }}>
                  Operators can register members and process check-ins. Their Ethereum address must also be set as <code>OPERATOR_PRIVATE_KEY</code> in this branch&apos;s environment file to enable server-side check-ins.
                </p>
                <div className="field"><label>Operator address</label><input type="text" placeholder="0x…" value={opAddr} onChange={e => setOpAddr(e.target.value)} /></div>
                <button className="full" onClick={handleAddOp} disabled={!opAddr || addOpTx.state.status === "pending"}>
                  {addOpTx.state.status === "pending" ? "Adding…" : "Add Operator"}
                </button>
                <TxFeedback state={addOpTx.state} explorerFn={explorerTx} />
              </div>
            )}

            {/* Settings tab */}
            {tab === "settings" && gym && (
              <div className="card">
                <div className="card-title">Branch Settings</div>
                <div className="field">
                  <label>Loyalty points per visit (current: {gym.pointsPerVisit.toString()})</label>
                  <input type="number" min="1" placeholder="100" value={newRate} onChange={e => setNewRate(e.target.value)} />
                </div>
                <div className="field">
                  <label>Check-in rate limit hours (current: {gym.checkInLimit.toString()}, 0 = no limit)</label>
                  <input type="number" min="0" placeholder="20" value={newLimit} onChange={e => setNewLimit(e.target.value)} />
                </div>
                <div className="field" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
                  <input
                    type="checkbox"
                    id="selfReg"
                    checked={selfRegOn}
                    onChange={e => setSelfRegOn(e.target.checked)}
                    style={{ width: "auto" }}
                  />
                  <label htmlFor="selfReg" style={{ margin: 0, cursor: "pointer" }}>
                    Allow self-registration (members can register themselves)
                  </label>
                </div>
                <button className="full" onClick={handleSaveSettings} disabled={settingsTx.state.status === "pending"}>
                  {settingsTx.state.status === "pending" ? "Saving…" : "Save Settings"}
                </button>
                <TxFeedback state={settingsTx.state} explorerFn={explorerTx} />
              </div>
            )}

            {/* Members tab - just a link to the operator view */}
            {tab === "members" && (
              <div className="card" style={{ textAlign: "center" }}>
                <p className="muted" style={{ marginBottom: "1rem" }}>Full member list is accessible from the operator dashboard.</p>
                <a href="/operator/login" className="btn" style={{ display: "inline-block", textDecoration: "none", background: "#e60f0f", color: "#fff", borderRadius: "100px", padding: "0.6rem 1.5rem", fontWeight: 700, fontSize: "0.9rem" }}>
                  Go to Operator Dashboard →
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function TxFeedback({ state, explorerFn }: {
  state: ReturnType<typeof useTx>["state"];
  explorerFn: (h: string) => string | null;
}) {
  if (state.status === "idle") return null;
  const url = state.hash ? explorerFn(state.hash) : null;
  if (state.status === "pending") return <div className="status pending">Pending…{url && <> <a href={url} target="_blank" rel="noopener noreferrer">View</a></>}</div>;
  if (state.status === "mined")   return <div className="status mined">Confirmed!{url && <> <a href={url} target="_blank" rel="noopener noreferrer">View</a></>}</div>;
  return <div className="status error">{state.errorMsg}</div>;
}
