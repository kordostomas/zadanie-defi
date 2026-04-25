"use client";

import { useState } from "react";
import { ContractTransactionResponse } from "ethers";

export type TxStatus = "idle" | "pending" | "mined" | "error";

export interface TxState {
  status:   TxStatus;
  hash:     string | null;
  errorMsg: string | null;
}

export function useTx() {
  const [state, setState] = useState<TxState>({ status: "idle", hash: null, errorMsg: null });

  async function send(fn: () => Promise<ContractTransactionResponse>): Promise<void> {
    setState({ status: "pending", hash: null, errorMsg: null });
    try {
      const tx = await fn();
      setState({ status: "pending", hash: tx.hash, errorMsg: null });
      await tx.wait();
      setState({ status: "mined", hash: tx.hash, errorMsg: null });
    } catch (err: unknown) {
      setState({ status: "error", hash: null, errorMsg: extractRevert(err) });
    }
  }

  function reset() {
    setState({ status: "idle", hash: null, errorMsg: null });
  }

  return { state, send, reset };
}

function extractRevert(err: unknown): string {
  if (typeof err !== "object" || err === null) return String(err);
  const e = err as Record<string, unknown>;
  if (typeof e.reason === "string") return e.reason;
  if (e.info && typeof e.info === "object") {
    const info = e.info as Record<string, unknown>;
    if (info.error && typeof info.error === "object") {
      const inner = info.error as Record<string, unknown>;
      if (typeof inner.message === "string") return inner.message;
    }
  }
  if (typeof e.message === "string") return e.message;
  return "Unknown error";
}
