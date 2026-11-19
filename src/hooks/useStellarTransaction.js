/**
 * useStellarTransaction - Issue #62
 *
 * Handles Stellar transaction signing, submission to the Soroban RPC,
 * and polling for confirmation.  Transaction lifecycle state updates
 * (begin/mark/confirm/fail) are the caller's responsibility — this hook
 * only manages the cryptographic and network operations.
 */

"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import {
  classifyTransactionError,
  TransactionStatus,
} from "@/lib/transactions/transaction";
import { STELLAR_RPC_URL } from "@/lib/config/chain";

/**
 * Frozen enum of transaction lifecycle states used by {@link useStellarTransaction}.
 */
export const TxStatus = Object.freeze({
  Idle: "idle",
  WaitingWallet: "waiting_wallet",
  Signing: "signing",
  Submitting: "submitting",
  PendingConfirmation: "pending_confirmation",
  Success: "success",
  Error: "error",
  NeedsRetry: "needs_retry",
});

async function sendTransaction(signedXdr) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendTransaction",
    params: { transaction: signedXdr },
  };

  const res = await fetch(STELLAR_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = await res.json();
  if (payload.error) {
    throw new Error(payload.error.message ?? "sendTransaction failed");
  }

  const { status, hash, errorResultXdr } = payload.result ?? {};
  if (status === "ERROR") {
    throw new Error(`Transaction rejected: ${errorResultXdr ?? "unknown error"}`);
  }

  return { hash, status };
}

async function pollTransaction(hash, { maxAttempts = 15, delayMs = 2_000 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: { hash },
    };

    const res = await fetch(STELLAR_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    const payload = await res.json();
    if (payload.error) continue;

    const { status, resultXdr } = payload.result ?? {};

    if (status === "SUCCESS") return { hash, status, resultXdr };
    if (status === "FAILED") {
      throw new Error(`Transaction failed on-chain: ${resultXdr ?? "no detail"}`);
    }
  }

  throw new Error("Transaction confirmation timed out");
}

/**
 * Manages Stellar transaction signing, submission, and polling.
 * The caller is responsible for beginTransaction / markStatus / confirmTransaction
 * via useTransactionCenter().
 *
 * @returns {{
 *   execute: (unsignedXdr: string, options?: { description?: string, explorerBaseUrl?: string }) => Promise<{ hash: string }>,
 *   state: { status: string, description?: string, hash?: string, error?: Error },
 *   reset: () => void,
 *   buildExplorerUrl: (hash: string) => string
 * }}
 */
export function useStellarTransaction() {
  const { signTransaction, isConnected } = useWallet();
  const [state, setState] = useState({ status: TxStatus.Idle });

  const reset = useCallback(() => {
    setState({ status: TxStatus.Idle });
  }, []);

  const execute = useCallback(
    async (unsignedXdr, { description = "Transaction", explorerBaseUrl } = {}) => {
      if (!isConnected) {
        const error = new Error(
          "Wallet not connected. Please connect your Stellar wallet first.",
        );
        setState({ status: TxStatus.WaitingWallet, error, description });
        throw error;
      }

      try {
        setState({ status: TxStatus.Signing, description });

        let signedXdr;
        try {
          signedXdr = await signTransaction(unsignedXdr);
        } catch (err) {
          const msg = err?.message ?? String(err);
          const isDismissal = /clos|cancel|reject|dismiss/i.test(msg);
          const walletError = Object.assign(
            new Error(isDismissal ? "Transaction cancelled in wallet" : msg),
            { dismissed: isDismissal },
          );
          setState({
            status: isDismissal ? TxStatus.NeedsRetry : TxStatus.Error,
            error: walletError,
            description,
          });
          throw walletError;
        }

        setState({ status: TxStatus.Submitting, description });
        const { hash } = await sendTransaction(signedXdr);
        setState({ status: TxStatus.PendingConfirmation, description, hash });

        const confirmed = await pollTransaction(hash);

        setState({ status: TxStatus.Success, hash: confirmed.hash, description });
        return { hash: confirmed.hash };
      } catch (err) {
        const failure = classifyTransactionError(err);
        setState({
          status:
            failure.status === TransactionStatus.NeedsRetry
              ? TxStatus.NeedsRetry
              : TxStatus.Error,
          error: err instanceof Error ? err : new Error(String(err)),
          description,
        });
        throw err;
      }
    },
    [isConnected, signTransaction],
  );

  return { execute, state, reset };
}
