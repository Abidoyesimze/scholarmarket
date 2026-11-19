'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { KitEventType, StellarWalletsKit } from '@creit-tech/stellar-wallets-kit';

import { ensureKitInitialized, NETWORK_PASSPHRASE, readWalletNetwork } from '@/lib/wallet/kit';
import { fetchBalances, BalancesStatus } from '@/lib/wallet/balance';

export const WalletStatus = Object.freeze({
  Initializing: 'initializing',
  Idle: 'idle',
  Connecting: 'connecting',
  Connected: 'connected',
  Locked: 'locked',
  Unsupported: 'unsupported',
  Expired: 'expired',
  Error: 'error',
});

export const WalletContext = createContext(null);

const SESSION_STORAGE_KEY = 'scholarmarket.wallet.session.v1';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24;

// Playwright E2E runs inject `window.__SCHOLARMARKET_E2E_WALLET__ = { address }`
// so flows can run headless without a wallet extension or live chain. The
// hook is only honoured when the app is built with NEXT_PUBLIC_E2E_WALLET_MOCK=true.
function getE2EMockAddress() {
  if (process.env.NEXT_PUBLIC_E2E_WALLET_MOCK !== 'true') return null;
  if (typeof window === 'undefined') return null;
  const address = window.__SCHOLARMARKET_E2E_WALLET__?.address;
  return typeof address === 'string' && address ? address : null;
}

export function WalletProvider({ children }) {
  const [state, setState] = useState({ status: WalletStatus.Initializing });

  const [balancesState, setBalancesState] = useState({
    status: BalancesStatus.Idle,
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const lastWalletIdRef = useRef(null);

  const persistSession = useCallback((session) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        address: session.address,
        walletId: session.walletId ?? null,
        passphrase: session.network.passphrase,
        persistedAt: Date.now(),
      }),
    );
  }, []);

  const clearPersistedSession = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }, []);

  const loadPersistedSession = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed.address !== 'string' ||
        typeof parsed.persistedAt !== 'number'
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, []);

  // Monotonic token for balance fetches — lets us ignore stale responses
  // when multiple refreshes overlap (e.g. address change while a manual
  // refresh is in flight).
  const balanceFetchTokenRef = useRef(0);

  // -------------------------------------------------------------------------
  // Balance loading
  // -------------------------------------------------------------------------

  const loadBalancesFor = useCallback(async (address) => {
    const token = ++balanceFetchTokenRef.current;
    setBalancesState({ status: BalancesStatus.Loading });

    try {
      const result = await fetchBalances(address);
      if (token !== balanceFetchTokenRef.current) return;

      if (result.status === 'unfunded') {
        setBalancesState({ status: BalancesStatus.Unfunded });
      } else {
        setBalancesState({
          status: BalancesStatus.Loaded,
          snapshot: result.snapshot,
        });
      }
    } catch (err) {
      if (token !== balanceFetchTokenRef.current) return;
      setBalancesState({
        status: BalancesStatus.Error,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }, []);

  const refreshBalances = useCallback(async () => {
    const current = stateRef.current;
    if (current.status !== WalletStatus.Connected) return;
    await loadBalancesFor(current.session.address);
  }, [loadBalancesFor]);

  const connectedAddress =
    state.status === WalletStatus.Connected ? state.session.address : null;

  useEffect(() => {
    if (!connectedAddress) {
      balanceFetchTokenRef.current++;
      // eslint-disable-next-line
      setBalancesState({ status: BalancesStatus.Idle });
      return;
    }
    loadBalancesFor(connectedAddress);
  }, [connectedAddress, loadBalancesFor]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        let address = getE2EMockAddress();
        if (!address) {
          ensureKitInitialized();
          try {
            const result = await StellarWalletsKit.getAddress();
            address = result.address;
          } catch {
            address = undefined;
          }
        }

        if (cancelled) return;

        const persisted = loadPersistedSession();
        if (persisted && Date.now() - persisted.persistedAt > SESSION_TTL_MS) {
          clearPersistedSession();
          setState({ status: WalletStatus.Expired });
          return;
        }

        if (address) {
          const walletPassphrase = persisted?.passphrase ?? NETWORK_PASSPHRASE;
          const session = {
            address,
            network: { passphrase: walletPassphrase },
            walletId: persisted?.walletId ?? lastWalletIdRef.current,
          };
          setState({
            status: WalletStatus.Connected,
            session,
          });
          persistSession(session);
        } else {
          setState(persisted ? { status: WalletStatus.Expired } : { status: WalletStatus.Idle });
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          status: WalletStatus.Error,
          error:
            err instanceof Error
              ? err
              : new Error('Failed to initialize wallet kit'),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearPersistedSession, loadPersistedSession, persistSession]);

  useEffect(() => {
    // The injected E2E wallet never goes through the kit, so its events
    // (e.g. a "no address" STATE_UPDATED) must not override it.
    if (getE2EMockAddress()) return undefined;

    const unsubSelected = StellarWalletsKit.on(
      KitEventType.WALLET_SELECTED,
      (event) => {
        lastWalletIdRef.current = event.payload.id ?? null;
      },
    );

    const unsubState = StellarWalletsKit.on(
      KitEventType.STATE_UPDATED,
      (event) => {
        const { address, networkPassphrase } = event.payload;

        if (!address) {
          setState({ status: WalletStatus.Locked });
          return;
        }

        if (networkPassphrase !== NETWORK_PASSPHRASE) {
          setState({
            status: WalletStatus.Unsupported,
            reason: 'wrong-network',
            address,
            actualPassphrase: networkPassphrase,
          });
          return;
        }

        setState({
          status: WalletStatus.Connected,
          session: {
            address,
            network: { passphrase: networkPassphrase },
            walletId: lastWalletIdRef.current,
          },
        });
        persistSession({
          address,
          network: { passphrase: networkPassphrase },
          walletId: lastWalletIdRef.current,
        });
      },
    );

    const unsubDisconnect = StellarWalletsKit.on(
      KitEventType.DISCONNECT,
      () => {
        lastWalletIdRef.current = null;
        clearPersistedSession();
        setState({ status: WalletStatus.Idle });
      },
    );

    return () => {
      unsubSelected();
      unsubState();
      unsubDisconnect();
    };
  }, [clearPersistedSession, persistSession]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const connect = useCallback(async () => {
    if (stateRef.current.status === WalletStatus.Connecting) return;

    setState({ status: WalletStatus.Connecting });
    try {
        const { address } = getE2EMockAddress()
          ? { address: getE2EMockAddress() }
          : await StellarWalletsKit.authModal();

      if (address) {
        const walletPassphrase = getE2EMockAddress()
          ? NETWORK_PASSPHRASE
          : (await readWalletNetwork()) ?? NETWORK_PASSPHRASE;
        if (walletPassphrase !== NETWORK_PASSPHRASE) {
          setState({
            status: WalletStatus.Unsupported,
            reason: 'wrong-network',
            address,
            actualPassphrase: walletPassphrase,
            walletId: lastWalletIdRef.current,
          });
          return;
        }
        const session = {
          address,
          network: { passphrase: walletPassphrase },
          walletId: lastWalletIdRef.current,
        };
        setState({
          status: WalletStatus.Connected,
          session,
        });
        persistSession(session);
      } else {
        setState({ status: WalletStatus.Locked });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isDismissal = /clos|cancel|reject|dismiss/i.test(message);

      if (isDismissal) {
        setState({ status: WalletStatus.Idle });
      } else {
        setState({
          status: WalletStatus.Error,
          error: err instanceof Error ? err : new Error(message),
        });
      }
    }
  }, [persistSession]);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch {
      // Some modules (e.g. stateless wallets like Albedo) may not implement
      // disconnect. Fine — DISCONNECT event resets state, or we fall through.
    }
    lastWalletIdRef.current = null;
    clearPersistedSession();
    setState({ status: WalletStatus.Idle });
  }, [clearPersistedSession]);

  const assertConnected = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== WalletStatus.Connected) {
      throw new Error(
        `Cannot sign while wallet is in state "${current.status}"`,
      );
    }
    return current.session.address;
  }, []);

  const signTransaction = useCallback(
    async (xdr, opts) => {
      const address = opts?.address ?? assertConnected();
      if (getE2EMockAddress()) return xdr;
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
        address,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      return signedTxXdr;
    },
    [assertConnected],
  );

  const signAuthEntry = useCallback(
    async (entryXdr, opts) => {
      const address = opts?.address ?? assertConnected();
      const { signedAuthEntry } = await StellarWalletsKit.signAuthEntry(
        entryXdr,
        {
          address,
          networkPassphrase: NETWORK_PASSPHRASE,
        },
      );
      return signedAuthEntry;
    },
    [assertConnected],
  );

  const networkPassphrase =
    state.status === WalletStatus.Connected
      ? state.session.network.passphrase
      : state.status === WalletStatus.Unsupported
        ? state.actualPassphrase ?? null
        : null;
  const walletId = state.session?.walletId ?? state.walletId ?? null;

  const value = useMemo(() => {
    const isConnected = state.status === WalletStatus.Connected;
    return {
      state,
      connect,
      disconnect,
      signTransaction,
      signAuthEntry,
      isConnected,
      address: isConnected || state.status === WalletStatus.Unsupported
        ? state.session?.address ?? state.address ?? null
        : null,
      balances: balancesState,
      refreshBalances,
      networkPassphrase,
      walletId,
    };
  }, [
    state,
    connect,
    disconnect,
    signTransaction,
    signAuthEntry,
    balancesState,
    refreshBalances,
    networkPassphrase,
  ]);

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}
