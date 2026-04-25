"use client";

import { useEffect, useState } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { connectWallet, isMetaMaskAvailable, onAccountChange, onChainChange } from "@/lib/wallet";
import { getGymBranch, readIsMember, getReadProvider } from "@/lib/contract";
import { useTx } from "@/lib/useTx";
import { BottomNav } from "../page";

export default function RegisterPage() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer,   setSigner]   = useState<JsonRpcSigner | null>(null);
  const [address,  setAddress]  = useState<string | null>(null);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [selfReg,  setSelfReg]  = useState(false);
  const [connErr,  setConnErr]  = useState<string | null>(null);
  const tx = useTx();

  useEffect(() => {
    const p = getReadProvider();
    const branch = getGymBranch(p);
    branch.allowSelfRegistration().then((v: unknown) => setSelfReg(Boolean(v))).catch(() => {});
  }, []);

  useEffect(() => {
    const unA = onAccountChange(() => window.location.reload());
    const unC = onChainChange(() => window.location.reload());
    return () => { unA(); unC(); };
  }, []);

  useEffect(() => {
    if (!address) return;
    const p = getReadProvider();
    readIsMember(address, p as Parameters<typeof readIsMember>[1]).then(setIsMember).catch(() => {});
  }, [address, tx.state.status]);

  async function handleConnect() {
    setConnErr(null);
    try {
      const r = await connectWallet();
      setProvider(r.provider);
      setSigner(r.signer);
      setAddress(r.address);
    } catch (e) {
      setConnErr(e instanceof Error ? e.message : "Connection failed");
    }
  }

  async function handleRegister() {
    if (!signer || !address) return;
    const c = getGymBranch(signer);
    await tx.send(() => c.registerMember(address) as ReturnType<typeof c.registerMember>);
  }

  return (
    <>
      <nav className="topnav">
        <div className="topnav-logo">GymFinder <span>·</span> Join</div>
      </nav>

      <div className="page">
        <div className="hero-sm">
          <h1>Join the Gym</h1>
          <p>Register your wallet as a member to start earning loyalty points.</p>
        </div>

        {/* Wallet */}
        <div className="wallet-card">
          {!address ? (
            <>
              {!isMetaMaskAvailable() && (
                <p className="status error" style={{ marginBottom: "0.75rem" }}>
                  MetaMask not detected. Please install it from metamask.io.
                </p>
              )}
              <button className="full" onClick={handleConnect} disabled={!isMetaMaskAvailable()}>
                Connect MetaMask
              </button>
              {connErr && <div className="status error">{connErr}</div>}
            </>
          ) : (
            <div className="wallet-connected">
              <div>
                <div className="stat-label">Connected wallet</div>
                <div className="wallet-addr">{address}</div>
              </div>
            </div>
          )}
        </div>

        {/* Registration */}
        {address && (
          <div className="card">
            {isMember === true ? (
              <>
                <div className="status mined" style={{ marginTop: 0 }}>
                  You are already a registered member of this gym.
                </div>
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
                  Head to <a href="/points">My Points</a> to see your balance or <a href="/shop">Shop</a> to redeem rewards.
                </p>
              </>
            ) : !selfReg ? (
              <div className="status info" style={{ marginTop: 0 }}>
                Self-registration is currently disabled. Ask a staff member to register you.
              </div>
            ) : (
              <>
                <div className="card-title">Self-Register</div>
                <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
                  Your wallet address <strong>{address.slice(0, 8)}…{address.slice(-6)}</strong> will be registered as a member.
                  A small gas fee (paid by you) is required.
                </p>
                <button
                  className="full"
                  onClick={handleRegister}
                  disabled={tx.state.status === "pending"}
                >
                  {tx.state.status === "pending" ? "Registering…" : "Register as Member"}
                </button>
                {tx.state.status !== "idle" && (
                  <div className={`status ${tx.state.status}`} style={{ marginTop: "0.75rem" }}>
                    {tx.state.status === "pending" && "Transaction pending…"}
                    {tx.state.status === "mined"   && "Welcome! You are now a member."}
                    {tx.state.status === "error"   && tx.state.errorMsg}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <BottomNav active="register" />
    </>
  );
}
