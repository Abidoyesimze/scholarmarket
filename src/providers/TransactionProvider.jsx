"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaClock,
  FaExternalLinkAlt,
  FaRedoAlt,
  FaTimes,
  FaCopy,
  FaCheck,
} from "react-icons/fa";
import {
  buildExplorerUrl,
  createIdleTransaction,
  createTransactionId,
  classifyTransactionError,
  TransactionStatus,
  TransactionTone,
} from "@/lib/transactions/transaction";

const TransactionContext = createContext(null);

function buildToastId() {
  return createTransactionId();
}

function toastToneClasses(tone) {
  switch (tone) {
    case TransactionTone.Success:
      return "border-emerald-200 bg-emerald-50/95 dark:bg-emerald-950/60 dark:border-emerald-800/40";
    case TransactionTone.Warning:
      return "border-amber-200 bg-amber-50/95 dark:bg-amber-950/60 dark:border-amber-800/40";
    case TransactionTone.Danger:
      return "border-rose-200 bg-rose-50/95 dark:bg-rose-950/60 dark:border-rose-800/40";
    default:
      return "border-slate-200 bg-white/95 dark:bg-slate-900/80 dark:border-slate-700/40";
  }
}

function toastIcon(tone, isSubmitting) {
  if (isSubmitting) {
    return (
      <svg className="h-5 w-5 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    );
  }
  switch (tone) {
    case TransactionTone.Success:
      return <FaCheckCircle className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />;
    case TransactionTone.Warning:
      return <FaExclamationTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400" />;
    case TransactionTone.Danger:
      return <FaExclamationTriangle className="h-5 w-5 text-rose-500 dark:text-rose-400" />;
    default:
      return <FaClock className="h-5 w-5 text-slate-400 dark:text-slate-500" />;
  }
}

function ToastItem({ toast, onDismiss, onRetry }) {
  const [copied, setCopied] = useState(false);

  const isSubmitting =
    toast.tone === TransactionTone.Info ||
    toast.tone === TransactionTone.Neutral;

  const handleCopy = () => {
    if (toast.txHash) {
      navigator.clipboard.writeText(toast.txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={`pointer-events-auto w-full rounded-2xl border p-4 shadow-xl backdrop-blur-md ${toastToneClasses(toast.tone)}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{toastIcon(toast.tone, isSubmitting)}</div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {toast.title}
          </p>
          {toast.message ? (
            <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">
              {toast.message}
            </p>
          ) : null}

          {toast.txHash ? (
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded-lg bg-slate-100/80 dark:bg-slate-800/60 px-2 py-1 font-mono text-xs text-slate-600 dark:text-slate-400">
                {toast.txHash.slice(0, 8)}…{toast.txHash.slice(-6)}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors"
                aria-label="Copy transaction hash"
              >
                {copied ? <FaCheck className="h-3 w-3 text-emerald-500" /> : <FaCopy className="h-3 w-3" />}
              </button>
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {toast.explorerHref ? (
              <a
                href={toast.explorerHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
              >
                View on StellarExpert
                <FaExternalLinkAlt className="h-3 w-3" />
              </a>
            ) : null}
            {toast.retryable && onRetry ? (
              <button
                type="button"
                onClick={() => onRetry(toast.id)}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100/80 dark:bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <FaRedoAlt className="h-3 w-3" />
                Retry
              </button>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
          aria-label="Dismiss notification"
        >
          <FaTimes className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

function ToastViewport({ toasts, dismissToast, onRetry }) {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex w-[min(92vw,22rem)] flex-col gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={dismissToast}
            onRetry={onRetry}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export function TransactionProvider({ children, onToastRetry }) {
  const [activeTransaction, setActiveTransaction] = useState(() =>
    createIdleTransaction(),
  );
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((toast) => {
    const id = toast.id || buildToastId();
    setToasts((current) => [
      ...current,
      {
        id,
        tone: TransactionTone.Info,
        title: "Transaction update",
        message: null,
        txHash: null,
        explorerHref: null,
        retryable: false,
        ...toast,
      },
    ]);

    if (toast.autoDismiss !== false) {
      window.setTimeout(() => dismissToast(id), toast.durationMs || 6000);
    }

    return id;
  }, [dismissToast]);

  const transitionToast = useCallback((id, updates) => {
    setToasts((current) =>
      current.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...updates };
        if (updates.autoDismiss !== false && !updates.retryable) {
          window.setTimeout(() => dismissToast(id), updates.durationMs || 6000);
        }
        return next;
      }),
    );
  }, [dismissToast]);

  const clearTransaction = useCallback(() => {
    setActiveTransaction(createIdleTransaction());
  }, []);

  const setTransaction = useCallback((updater) => {
    setActiveTransaction((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      return {
        ...current,
        ...next,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const beginTransaction = useCallback(({
    scope = "general",
    title,
    message,
    detail,
    explorerBaseUrl,
    context = {},
  } = {}) => {
    const startedAt = new Date().toISOString();
    const id = createTransactionId();
    setActiveTransaction({
      ...createIdleTransaction(scope),
      id,
      scope,
      title: title || null,
      status: TransactionStatus.WaitingWallet,
      tone: TransactionTone.Info,
      message: message || null,
      detail: detail || null,
      explorerUrl: null,
      txHash: null,
      retryable: true,
      error: null,
      startedAt,
      updatedAt: startedAt,
      context,
      explorerBaseUrl: explorerBaseUrl || null,
    });
    return id;
  }, []);

  const markStatus = useCallback((status, patch = {}) => {
    setTransaction((current) => {
      const explorerUrl =
        patch.explorerUrl ?? buildExplorerUrl(patch.txHash ?? current.txHash, patch.explorerBaseUrl ?? current.explorerBaseUrl);

      return {
        ...current,
        status,
        tone:
          patch.tone ||
          (status === TransactionStatus.Confirmed
            ? TransactionTone.Success
            : status === TransactionStatus.Failed
              ? TransactionTone.Danger
              : status === TransactionStatus.NeedsRetry
                ? TransactionTone.Warning
                : TransactionTone.Info),
        title: patch.title ?? current.title,
        message: patch.message ?? current.message,
        detail: patch.detail ?? current.detail,
        txHash: patch.txHash ?? current.txHash,
        explorerUrl,
        retryable: patch.retryable ?? current.retryable,
        error: patch.error ?? current.error,
        context: patch.context ? { ...current.context, ...patch.context } : current.context,
        explorerBaseUrl: patch.explorerBaseUrl ?? current.explorerBaseUrl ?? null,
      };
    });
  }, [setTransaction]);

  const pushOptimisticToast = useCallback(({ txHash, description, explorerBaseUrl }) => {
    const explorerHref = buildExplorerUrl(txHash, explorerBaseUrl);
    return pushToast({
      tone: TransactionTone.Info,
      title: `${description || "Transaction"} submitted`,
      message: "Waiting for network confirmation\u2026",
      txHash,
      explorerHref,
      retryable: false,
      autoDismiss: false,
    });
  }, [pushToast]);

  const failTransaction = useCallback((error, patch = {}) => {
    const failure = classifyTransactionError(error);

    setTransaction((current) => ({
      ...current,
      id: current.id || createTransactionId(),
      status: patch.status || failure.status,
      tone: patch.tone || failure.tone,
      title: patch.title || failure.title,
      message: patch.message || failure.message,
      detail: patch.detail ?? current.detail,
      txHash: patch.txHash ?? current.txHash,
      explorerUrl: patch.explorerUrl ?? current.explorerUrl,
      retryable: patch.retryable ?? failure.retryable,
      error: error instanceof Error ? error : new Error(String(error)),
      updatedAt: new Date().toISOString(),
      context: patch.context ? { ...current.context, ...patch.context } : current.context,
    }));

    if (patch.notify !== false) {
      pushToast({
        tone: patch.tone || failure.tone,
        title: patch.toastTitle || failure.title,
        message: patch.toastMessage || failure.message,
        txHash: patch.txHash ?? null,
        explorerHref: patch.explorerUrl ?? null,
        actionLabel: patch.actionLabel || (patch.retryable ?? failure.retryable ? "Retry" : null),
        actionHref: patch.actionHref || null,
        retryable: patch.retryable ?? failure.retryable,
        autoDismiss: !(patch.retryable ?? failure.retryable),
      });
    }
  }, [pushToast, setTransaction]);

  const confirmTransaction = useCallback((patch = {}) => {
    setTransaction((current) => ({
      ...current,
      status: TransactionStatus.Confirmed,
      tone: TransactionTone.Success,
      title: patch.title || current.title || "Transaction confirmed",
      message: patch.message || current.message || "The network confirmed the transaction.",
      detail: patch.detail ?? current.detail,
      txHash: patch.txHash ?? current.txHash,
      explorerUrl: patch.explorerUrl ?? buildExplorerUrl(patch.txHash ?? current.txHash, patch.explorerBaseUrl ?? current.explorerBaseUrl),
      retryable: false,
      error: null,
      updatedAt: new Date().toISOString(),
      context: patch.context ? { ...current.context, ...patch.context } : current.context,
    }));

    if (patch.notify !== false) {
      const resolvedHash = patch.txHash ?? null;
      const resolvedExplorer =
        patch.explorerUrl ??
        buildExplorerUrl(resolvedHash, patch.explorerBaseUrl ?? activeTransaction.explorerBaseUrl);

      pushToast({
        tone: TransactionTone.Success,
        title: patch.toastTitle || "Transaction confirmed",
        message: patch.toastMessage || "The network confirmed your action.",
        txHash: resolvedHash,
        explorerHref: resolvedExplorer,
        retryable: false,
      });
    }
  }, [activeTransaction.explorerBaseUrl, pushToast, setTransaction]);

  const retryTransaction = useCallback((patch = {}) => {
    setTransaction((current) => ({
      ...current,
      status: TransactionStatus.WaitingWallet,
      tone: TransactionTone.Info,
      message: patch.message ?? current.message,
      detail: patch.detail ?? current.detail,
      retryable: true,
      error: null,
      updatedAt: new Date().toISOString(),
      context: patch.context ? { ...current.context, ...patch.context } : current.context,
    }));
  }, [setTransaction]);

  const value = useMemo(() => ({
    activeTransaction,
    beginTransaction,
    markStatus,
    confirmTransaction,
    failTransaction,
    retryTransaction,
    clearTransaction,
    pushToast,
    pushOptimisticToast,
    dismissToast,
  }), [
    activeTransaction,
    beginTransaction,
    markStatus,
    confirmTransaction,
    failTransaction,
    retryTransaction,
    clearTransaction,
    pushToast,
    pushOptimisticToast,
    dismissToast,
  ]);

  const handleRetry = useCallback((toastId) => {
    dismissToast(toastId);
    if (onToastRetry) onToastRetry();
  }, [dismissToast, onToastRetry]);

  return (
    <TransactionContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismissToast={dismissToast} onRetry={handleRetry} />
    </TransactionContext.Provider>
  );
}

export function useTransactionCenter() {
  const context = useContext(TransactionContext);
  if (!context) {
    throw new Error("useTransactionCenter must be used within a TransactionProvider");
  }
  return context;
}
