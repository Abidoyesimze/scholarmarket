import { createElement } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import {
    MockWalletProvider,
    MOCK_WALLET_ADDRESS,
    createConnectedWalletValue,
    createDisconnectedWalletValue,
} from '../mocks/stellarWalletContext';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useCart', () => ({
    useCart: () => ({ cartItems: [], setIsCartOpen: vi.fn() }),
}));

vi.mock('@/components/notifications/NotificationCenter', () => ({
    default: () => null,
}));

vi.mock('@/lib/config/chain', () => ({
    isMainnet: false,
    getNetworkName: (passphrase) => {
        if (passphrase === 'Test SDF Network ; September 2015') return 'Testnet';
        if (passphrase === 'Public Global Stellar Network ; September 2015') return 'Mainnet';
        return 'Unknown';
    },
    getExplorerAccountUrl: (addr) => `https://stellar.expert/explorer/testnet/account/${addr}`,
}));

import Navbar from '@/components/Navbar';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function renderNavbar(walletValue) {
    return render(
        createElement(MockWalletProvider, { value: walletValue }, createElement(Navbar))
    );
}

beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });
});

afterEach(() => {
    cleanup();
});

describe('Navbar — wallet-dependent layout', () => {
    it('renders the connect-wallet prompt when no wallet is connected', () => {
        renderNavbar(createDisconnectedWalletValue());

        expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
        expect(screen.queryByText(/GDUMMY/)).not.toBeInTheDocument();
    });

    it('renders the connected wallet layout with the formatted dummy address', () => {
        renderNavbar(createConnectedWalletValue());

        const shortAddress = `${MOCK_WALLET_ADDRESS.slice(0, 6)}...${MOCK_WALLET_ADDRESS.slice(-4)}`;
        expect(screen.getByText(shortAddress)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /connect wallet/i })).not.toBeInTheDocument();
    });

    it('reflects a custom connected address passed via the mock context', () => {
        const customAddress = 'GCUSTOMADDRESSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        renderNavbar(createConnectedWalletValue({ address: customAddress }));

        const shortAddress = `${customAddress.slice(0, 6)}...${customAddress.slice(-4)}`;
        expect(screen.getByText(shortAddress)).toBeInTheDocument();
    });

    it('displays the dynamic network name from wallet passphrase', () => {
        renderNavbar(createConnectedWalletValue());

        expect(screen.getByText('Testnet')).toBeInTheDocument();
    });

    it('calls /api/auth/logout before client-side disconnect', async () => {
        const mockDisconnect = vi.fn();
        renderNavbar(createConnectedWalletValue({ disconnect: mockDisconnect }));

        const disconnectBtn = screen.getByRole('button', { name: /disconnect wallet/i });
        disconnectBtn.click();

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
        });

        await waitFor(() => {
            expect(mockDisconnect).toHaveBeenCalled();
        });
    });

    it('proceeds with client-side disconnect even if server logout fails', async () => {
        const mockDisconnect = vi.fn();
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
        renderNavbar(createConnectedWalletValue({ disconnect: mockDisconnect }));

        const disconnectBtn = screen.getByRole('button', { name: /disconnect wallet/i });
        disconnectBtn.click();

        await waitFor(() => {
            expect(mockDisconnect).toHaveBeenCalled();
        });
    });
});
