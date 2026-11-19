import { createHmac } from 'node:crypto';
import type { BrowserContext, Route } from '@playwright/test';
import { E2E_BASE_URL, E2E_JWT_SECRET } from './env';

/**
 * In-memory ScholarMarket backend for Playwright.
 *
 * Every browser request to `/api/**` is answered from this store, and every
 * request leaving the app origin (Soroban RPC, Horizon, Pinata gateways, …)
 * is intercepted, so specs never touch a live chain, IPFS or MongoDB. The
 * store lives in the test process, so state survives page reloads within a
 * test — which is what lets the specs assert persistence.
 */

export type Role = 'learner' | 'admin';

export interface Session {
  sub: string;
  walletAddress: string;
  role: Role;
  name: string;
}

export interface MockMaterial {
  _id: string;
  title: string;
  subject: string;
  description: string;
  price: number;
  author: string;
  userAddress: string;
  visibility: 'public' | 'delisted';
  fileType: string;
}

interface Purchase {
  purchaseId: string;
  materialId: string;
  buyerAddress: string;
  transactionHash: string;
  amount: string;
  asset: string;
  purchasedAt: string;
}

interface Report {
  id: string;
  materialId: string;
  materialTitle: string;
  reason: string;
  description: string;
  reporterAddress: string;
  status: 'pending_review' | 'actioned' | 'dismissed';
  createdAt: string;
}

// Valid-looking Stellar public keys (shape only; never funded or used on-chain).
export const LEARNER: Session = {
  sub: '64b000000000000000000001',
  walletAddress: 'GAE2ELEARNERWALLET0000000000000000000000000000000000000',
  role: 'learner',
  name: 'E2E Learner',
};

export const ADMIN: Session = {
  sub: '64b000000000000000000002',
  walletAddress: 'GAE2EADMINWALLET00000000000000000000000000000000000000',
  role: 'admin',
  name: 'E2E Admin',
};

const CREATOR_ADDRESS = 'GAE2ECREATORWALLET0000000000000000000000000000000000000';

export function seedMaterials(): MockMaterial[] {
  const base = { userAddress: CREATOR_ADDRESS, visibility: 'public' as const, fileType: 'pdf' };
  return [
    {
      ...base,
      _id: '65f000000000000000000001',
      title: 'Organic Chemistry Reaction Mechanisms',
      subject: 'Chemistry',
      description: 'Arrow-pushing walkthroughs for 40 core mechanisms.',
      price: 12,
      author: 'Dr. Ada',
    },
    {
      ...base,
      _id: '65f000000000000000000002',
      title: 'Linear Algebra Problem Set',
      subject: 'Mathematics',
      description: 'Worked solutions for eigenvalues and vector spaces.',
      price: 8,
      author: 'Prof. Turing',
    },
    {
      ...base,
      _id: '65f000000000000000000003',
      title: 'Cell Biology Revision Notes',
      subject: 'Biology',
      description: 'Concise notes on organelles, transport and signalling.',
      price: 5,
      author: 'Dr. Franklin',
    },
  ];
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url');
}

/** Mint an HS256 session JWT that src/lib/auth/session.js accepts. */
export function signSessionToken(session: Session, secret = E2E_JWT_SECRET) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      ...session,
      address: session.walletAddress,
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function decodeSession(cookieHeader: string | undefined): Session | null {
  const token = cookieHeader?.match(/(?:^|;\s*)auth_token=([^;]+)/)?.[1];
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload?.sub ? (payload as Session) : null;
  } catch {
    return null;
  }
}

export class MockBackend {
  materials: MockMaterial[] = seedMaterials();
  saved = new Map<string, Set<string>>();
  purchases: Purchase[] = [];
  notes = new Map<string, string>();
  reports: Report[] = [];
  private counter = 0;

  private nextId(prefix: string) {
    this.counter += 1;
    return `${prefix}${String(this.counter).padStart(24 - prefix.length, '0')}`;
  }

  material(id: string) {
    return this.materials.find((m) => m._id === id) ?? null;
  }

  visibleMaterials() {
    return this.materials.filter((m) => m.visibility === 'public');
  }

  hasPurchased(materialId: string, address: string) {
    return this.purchases.some(
      (p) => p.materialId === materialId && p.buyerAddress.toLowerCase() === address.toLowerCase(),
    );
  }

  /**
   * Wire the backend into a browser context: API routes, external network
   * isolation, the injected wallet, and (optionally) a signed session cookie.
   */
  async attach(context: BrowserContext, session?: Session) {
    if (session) {
      await context.addCookies([
        {
          name: 'auth_token',
          value: signSessionToken(session),
          url: E2E_BASE_URL,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
      await context.addInitScript((address) => {
        (window as unknown as { __SCHOLARMARKET_E2E_WALLET__: { address: string } }).__SCHOLARMARKET_E2E_WALLET__ = {
          address,
        };
      }, session.walletAddress);
    }

    const appHost = new URL(E2E_BASE_URL).host;

    // Anything leaving the app origin: chain RPC, Horizon, IPFS/Pinata, analytics.
    await context.route(
      (url) => url.host !== appHost,
      (route) => this.handleExternal(route),
    );

    await context.route(`${E2E_BASE_URL}/api/**`, (route) => this.handleApi(route));

    // Stand-in for the IPFS gateway URL returned by /api/materials/download/:id.
    await context.route(`${E2E_BASE_URL}/mock-ipfs/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4\n% e2e fixture\n') }),
    );
  }

  private async handleExternal(route: Route) {
    const request = route.request();
    if (request.method() === 'POST') {
      // Soroban JSON-RPC (sendTransaction / getTransaction / simulateTransaction).
      let body: { method?: string; params?: { hash?: string } } = {};
      try {
        body = request.postDataJSON() ?? {};
      } catch {
        body = {};
      }
      if (body.method === 'sendTransaction') {
        return json(route, { jsonrpc: '2.0', id: 1, result: { status: 'PENDING', hash: `e2e${Date.now().toString(16)}` } });
      }
      if (body.method === 'getTransaction') {
        return json(route, { jsonrpc: '2.0', id: 1, result: { status: 'SUCCESS', hash: body.params?.hash } });
      }
      return json(route, { jsonrpc: '2.0', id: 1, result: {} });
    }
    // Horizon account lookups etc. — an unfunded account is fine for the UI.
    return json(route, { status: 404, title: 'Resource Missing' }, 404);
  }

  private async handleApi(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    const headers = await request.allHeaders();
    const session = decodeSession(headers.cookie);
    const body = (() => {
      try {
        return request.postDataJSON() ?? {};
      } catch {
        return {};
      }
    })();

    let match: RegExpMatchArray | null;

    // ── Marketplace ──────────────────────────────────────────────────────
    // materialService builds query strings with URLSearchParams, which
    // serialises unset filters as the literal string "undefined".
    const param = (name: string) => {
      const value = url.searchParams.get(name);
      return value && value !== 'undefined' && value !== 'null' ? value : null;
    };

    if (path === '/api/market-materials') {
      const id = url.searchParams.get('id');
      if (id) {
        const material = this.material(id);
        return material && material.visibility === 'public'
          ? json(route, material)
          : json(route, { error: 'Material not found' }, 404);
      }
      const search = (param('search') || '').trim().toLowerCase();
      const subject = param('subject');
      const items = this.visibleMaterials().filter(
        (m) =>
          (!search || `${m.title} ${m.description}`.toLowerCase().includes(search)) &&
          (!subject || m.subject === subject),
      );
      return json(route, { items, page: 1, pageSize: 12, total: items.length, totalPages: 1 });
    }

    if (path === '/api/materials/search') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      return json(route, { items: this.visibleMaterials().filter((m) => m.title.toLowerCase().includes(q)) });
    }

    if (path === '/api/subjects') {
      return json(route, {
        categories: [],
        subjects: [...new Set(this.materials.map((m) => m.subject))],
        levels: [],
      });
    }

    if (path === '/api/materials/history') return json(route, []);
    if ((match = path.match(/^\/api\/materials\/([^/]+)\/feedback$/))) return json(route, { items: [] });

    // ── Saved materials ─────────────────────────────────────────────────
    if (path === '/api/saved-materials') {
      if (!session) return json(route, { error: 'Unauthorized' }, 401);
      const key = session.walletAddress.toLowerCase();
      const ids = this.saved.get(key) ?? new Set<string>();
      this.saved.set(key, ids);
      if (method === 'POST') {
        ids.add(String(body.materialId));
        return json(route, { success: true }, 201);
      }
      if (method === 'DELETE') {
        ids.delete(String(url.searchParams.get('materialId')));
        return json(route, { success: true });
      }
      return json(route, {
        items: [...ids].map((materialId) => ({
          materialId,
          material: this.material(materialId),
          savedAt: new Date().toISOString(),
        })),
      });
    }

    // ── Purchase & entitlement ──────────────────────────────────────────
    if (path === '/api/materials/access') {
      const materialId = String(url.searchParams.get('materialId') ?? body.materialId ?? '');
      const buyer = String(url.searchParams.get('buyerAddress') ?? body.buyerAddress ?? '');
      const owned = this.hasPurchased(materialId, buyer);
      if (method === 'POST') return json(route, { hasAccess: owned, status: owned ? 'active' : 'pending' }, owned ? 200 : 202);
      return json(route, { hasAccess: owned, status: owned ? 'active' : 'not_purchased' });
    }

    if (path === '/api/entitlements/batch') {
      const ids: string[] = Array.isArray(body.materialIds) ? body.materialIds : [];
      return json(route, {
        results: ids.map((materialId) => ({
          materialId,
          hasAccess: this.hasPurchased(materialId, String(body.buyerAddress ?? '')),
        })),
      });
    }

    if (path === '/api/checkout/build-xdr') {
      return json(route, { unsignedXdr: 'AAAAAgAAAABE2EMOCKXDR', explorerBaseUrl: 'https://stellar.expert/explorer/testnet' });
    }

    if (path === '/api/purchase') {
      if (method === 'POST') {
        const purchase: Purchase = {
          purchaseId: this.nextId('66a'),
          materialId: String(body.materialId),
          buyerAddress: String(body.buyerAddress),
          transactionHash: String(body.transactionHash || 'e2e-tx'),
          amount: String(body.amount ?? ''),
          asset: String(body.asset ?? 'XLM'),
          purchasedAt: new Date().toISOString(),
        };
        this.purchases.push(purchase);
        return json(route, { success: true, purchaseId: purchase.purchaseId, purchase }, 201);
      }
      const mine = session
        ? this.purchases.filter((p) => p.buyerAddress.toLowerCase() === session.walletAddress.toLowerCase())
        : [];
      return json(
        route,
        mine.map((p) => ({ ...p, _id: p.purchaseId, title: this.material(p.materialId)?.title })),
      );
    }

    if (path === '/api/purchased-materials') {
      if (!session) return json(route, { error: 'Unauthorized' }, 401);
      return json(
        route,
        this.purchases
          .filter((p) => p.buyerAddress.toLowerCase() === session.walletAddress.toLowerCase())
          .map((p) => ({ ...p, material: this.material(p.materialId) })),
      );
    }

    if ((match = path.match(/^\/api\/materials\/download\/([^/]+)$/))) {
      return json(route, { downloadUrl: `${E2E_BASE_URL}/mock-ipfs/${match[1]}.pdf`, title: this.material(match[1])?.title });
    }

    // ── Learner notes ───────────────────────────────────────────────────
    if ((match = path.match(/^\/api\/materials\/([^/]+)\/notes$/))) {
      if (!session) return json(route, { error: 'Unauthorized' }, 401);
      const key = `${match[1]}:${session.walletAddress.toLowerCase()}`;
      if (method === 'PUT') {
        this.notes.set(key, String(body.note ?? ''));
      }
      return json(route, { note: this.notes.get(key) ?? '', updatedAt: new Date().toISOString() });
    }

    // ── Moderation ──────────────────────────────────────────────────────
    if ((match = path.match(/^\/api\/materials\/([^/]+)\/report$/))) {
      if (!session) return json(route, { error: 'Unauthorized' }, 401);
      const material = this.material(match[1]);
      if (!material) return json(route, { error: 'Material not found' }, 404);
      const report: Report = {
        id: this.nextId('67b'),
        materialId: material._id,
        materialTitle: material.title,
        reason: String(body.reason),
        description: String(body.description ?? ''),
        reporterAddress: session.walletAddress,
        status: 'pending_review',
        createdAt: new Date().toISOString(),
      };
      this.reports.push(report);
      return json(route, { success: true, reportId: report.id, moderation: { status: 'pending_review' } }, 201);
    }

    if (path === '/api/admin/moderation') {
      if (session?.role !== 'admin') return json(route, { error: 'Forbidden: Admin privileges required' }, 403);
      return json(route, { items: this.reports.filter((r) => r.status === 'pending_review') });
    }

    if ((match = path.match(/^\/api\/admin\/moderation\/([^/]+)$/))) {
      if (session?.role !== 'admin') return json(route, { error: 'Forbidden: Admin privileges required' }, 403);
      const report = this.reports.find((r) => r.id === match![1]);
      if (!report) return json(route, { error: 'Report not found' }, 404);
      if (body.action === 'delist') {
        const material = this.material(report.materialId);
        if (material) material.visibility = 'delisted';
        this.reports
          .filter((r) => r.materialId === report.materialId && r.status === 'pending_review')
          .forEach((r) => (r.status = 'actioned'));
      } else {
        report.status = 'dismissed';
      }
      return json(route, { success: true, reportId: report.id, action: body.action });
    }

    // ── Profile / dashboard chrome ──────────────────────────────────────
    if (path === '/api/profile') {
      if (!session) return json(route, { exists: false });
      return json(route, {
        exists: true,
        user: { fullName: session.name, walletAddress: session.walletAddress, role: session.role },
      });
    }

    if (path === '/api/progress') return json(route, []);

    // Anything else the UI touches (analytics beacons, stats widgets) gets an
    // empty success so it renders its empty state instead of hitting the server.
    return json(route, method === 'GET' ? { items: [] } : { success: true });
  }
}

function json(route: Route, data: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
}
