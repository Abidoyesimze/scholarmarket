'use client';

import { NETWORK_PASSPHRASE, getNetworkName } from '@/lib/config/chain';
import { useWallet } from '@/hooks/useWallet';

const walletHelp = {
  freighter: 'Open Freighter, select the network menu, and choose the configured network.',
  xbull: 'Open xBull, open network settings, and select the configured network.',
  albedo: 'Open Albedo settings and select the configured Stellar network.',
};

export default function NetworkMismatchBanner() {
  const { state, networkPassphrase, walletId } = useWallet();
  const mismatch =
    state.status === 'unsupported' &&
    networkPassphrase &&
    networkPassphrase !== NETWORK_PASSPHRASE;

  if (!mismatch) return null;

  const walletName = String(walletId || '').toLowerCase();
  const help = Object.entries(walletHelp).find(([name]) => walletName.includes(name))?.[1]
    || 'Open your wallet settings and select the configured Stellar network.';

  return (
    <div role="alert" className="fixed left-0 right-0 top-[76px] z-[99] border-y border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 text-sm md:flex-row md:items-center md:justify-between">
        <p>
          <strong>Wrong wallet network.</strong> Your wallet is on {getNetworkName(networkPassphrase)}, but this app requires {getNetworkName(NETWORK_PASSPHRASE)}. Checkout is disabled until you switch networks.
        </p>
        <p className="text-xs text-amber-800">{help}</p>
      </div>
    </div>
  );
}
