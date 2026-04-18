"use client";

import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, JsonRpcSigner, parseEther, formatEther } from "ethers";
import {
  CONTRACT_ADDRESS,
  ETHERSCAN_BASE,
  getWriteContract,
  readContractBalance,
  readOwner,
  readValue,
} from "@/lib/contract";
import {
  connectWallet,
  isMetaMaskAvailable,
  onAccountChange,
  onChainChange,
} from "@/lib/wallet";
import { useTx } from "@/lib/useTx";

export default function Home() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [storedValue, setStoredValue] = useState<bigint | null>(null);
  const [vaultBalance, setVaultBalance] = useState<string>("0");
  const [newValue, setNewValue] = useState("");
  const [payment, setPayment] = useState("0.01");
  const [connectError, setConnectError] = useState<string | null>(null);

  const setTx = useTx();
  const withdrawTx = useTx();

  const refresh = useCallback(async (p: BrowserProvider) => {
    try {
      const [val, own, bal] = await Promise.all([
        readValue(p),
        readOwner(p),
        readContractBalance(p),
      ]);
      setStoredValue(val);
      setOwner(own);
      setVaultBalance(bal);
    } catch {
      // provider may not be ready yet
    }
  }, []);

  // Auto-refresh on wallet/chain change
  useEffect(() => {
    const unsubAccount = onAccountChange(() => window.location.reload());
    const unsubChain = onChainChange(() => window.location.reload());
    return () => {
      unsubAccount();
      unsubChain();
    };
  }, []);

  // Refresh state after each transaction
  useEffect(() => {
    if ((setTx.state.status === "mined" || withdrawTx.state.status === "mined") && provider) {
      refresh(provider);
    }
  }, [setTx.state.status, withdrawTx.state.status, provider, refresh]);

  async function handleConnect() {
    setConnectError(null);
    try {
      const result = await connectWallet();
      setProvider(result.provider);
      setSigner(result.signer);
      setAddress(result.address);
      await refresh(result.provider);
    } catch (e: unknown) {
      setConnectError(e instanceof Error ? e.message : "Connection failed");
    }
  }

  async function handleSet() {
    if (!signer) return;
    const contract = getWriteContract(signer);
    const val = BigInt(newValue);
    const eth = parseEther(payment);
    await setTx.send(() =>
      contract.set(val, { value: eth }) as Promise<Awaited<ReturnType<typeof contract.set>>>
    );
  }

  async function handleWithdraw() {
    if (!signer) return;
    const contract = getWriteContract(signer);
    await withdrawTx.send(() =>
      contract.withdraw() as Promise<Awaited<ReturnType<typeof contract.withdraw>>>
    );
  }

  const isOwner = address && owner && address.toLowerCase() === owner.toLowerCase();
  const explorerTxUrl = (hash: string) =>
    ETHERSCAN_BASE ? `${ETHERSCAN_BASE}/tx/${hash}` : null;
  const explorerContractUrl = ETHERSCAN_BASE
    ? `${ETHERSCAN_BASE}/address/${CONTRACT_ADDRESS}`
    : null;

  return (
    <>
      {/* Header */}
      <div className="card" style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <h1>SimpleVault</h1>
        <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          Pay to store a number on-chain.
        </p>
      </div>

      {/* Wallet connection */}
      <div className="card">
        <h2>Wallet</h2>
        {!address ? (
          <>
            {!isMetaMaskAvailable() && (
              <p style={{ color: "#fca5a5", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
                MetaMask not detected. Install it to continue.
              </p>
            )}
            <button onClick={handleConnect} disabled={!isMetaMaskAvailable()}>
              Connect MetaMask
            </button>
            {connectError && <div className="status error">{connectError}</div>}
          </>
        ) : (
          <>
            <div className="label">Connected address</div>
            <div className="address">
              {address}
              {isOwner && <span className="badge owner">Owner</span>}
            </div>
          </>
        )}
      </div>

      {/* Contract state */}
      <div className="card">
        <h2>Contract State</h2>
        <div className="label">Stored value</div>
        <div className="value">
          {storedValue !== null ? storedValue.toString() : "—"}
        </div>
        <div style={{ marginTop: "1rem" }}>
          <div className="label">Vault ETH balance</div>
          <div className="value">{vaultBalance} ETH</div>
        </div>
        {provider && (
          <button
            className="secondary"
            style={{ marginTop: "1rem" }}
            onClick={() => refresh(provider)}
          >
            Refresh
          </button>
        )}
      </div>

      {/* Set value */}
      <div className="card">
        <h2>Set Value</h2>
        <div className="label">New value (uint256)</div>
        <input
          type="number"
          min="0"
          placeholder="e.g. 42"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          disabled={!address}
        />
        <div className="label" style={{ marginTop: "0.75rem" }}>
          Payment (ETH) — minimum 1 wei
        </div>
        <input
          type="number"
          min="0"
          step="0.001"
          placeholder="e.g. 0.01"
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
          disabled={!address}
        />
        <button
          onClick={handleSet}
          disabled={!address || !newValue || setTx.state.status === "pending"}
        >
          {setTx.state.status === "pending" ? "Sending…" : "Set value"}
        </button>
        <TxFeedback state={setTx.state} explorerFn={explorerTxUrl} />
      </div>

      {/* Withdraw — only shown to owner */}
      {isOwner && (
        <div className="card">
          <h2>Withdraw (Owner only)</h2>
          <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: "0.5rem" }}>
            Sends the full vault balance ({vaultBalance} ETH) to your address.
          </p>
          <button
            className="danger"
            onClick={handleWithdraw}
            disabled={vaultBalance === "0.0" || withdrawTx.state.status === "pending"}
          >
            {withdrawTx.state.status === "pending" ? "Sending…" : "Withdraw all ETH"}
          </button>
          <TxFeedback state={withdrawTx.state} explorerFn={explorerTxUrl} />
        </div>
      )}

      {/* Footer */}
      <footer>
        <div>
          Contract:{" "}
          {explorerContractUrl ? (
            <a href={explorerContractUrl} target="_blank" rel="noopener noreferrer">
              {CONTRACT_ADDRESS}
            </a>
          ) : (
            <span className="address">{CONTRACT_ADDRESS}</span>
          )}
        </div>
        <div style={{ marginTop: "0.25rem" }}>DMBLOCK Assignment 2 · SimpleVault scaffold</div>
      </footer>
    </>
  );
}

function TxFeedback({
  state,
  explorerFn,
}: {
  state: ReturnType<typeof useTx>["state"];
  explorerFn: (hash: string) => string | null;
}) {
  if (state.status === "idle") return null;
  if (state.status === "pending") {
    const url = state.hash ? explorerFn(state.hash) : null;
    return (
      <div className="status pending">
        Transaction pending…{" "}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            View on explorer
          </a>
        )}
      </div>
    );
  }
  if (state.status === "mined") {
    const url = state.hash ? explorerFn(state.hash) : null;
    return (
      <div className="status mined">
        Confirmed!{" "}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            View on explorer
          </a>
        )}
      </div>
    );
  }
  return <div className="status error">{state.errorMsg}</div>;
}
