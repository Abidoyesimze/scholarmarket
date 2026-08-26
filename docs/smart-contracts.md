# Soroban Smart Contracts

This document describes the Soroban smart contracts that power ScholarMarket's on-chain payment and entitlement system. It is written for developers with basic Stellar knowledge who want to understand how the contracts work, what data they store, and how funds flow during a purchase.

## Overview

ScholarMarket uses two Soroban smart contracts written in Rust:

| Contract | Purpose |
| --- | --- |
| `material-registry` | Source of truth for creator-owned listings. Stores material metadata, pricing, and payout configuration. |
| `purchase-manager` | Source of truth for payments and entitlements. Handles purchase settlement, escrow, disputes, and buyer access rights. |

The contracts are deployed separately and never call each other directly. The off-chain indexer and backend bridge the two by reading events from both.

```text
                      +---------------------+
                      |   material-registry  |
                      |                      |
                      |  - Material listings |
                      |  - Price quotes      |
                      |  - Payout splits     |
                      +----------+-----------+
                                 |
                    (events read by indexer)
                                 |
                                 v
                      +---------------------+
                      |  purchase-manager   |
                      |                     |
                      |  - Buyer payments   |
                      |  - Escrow holds     |
                      |  - Entitlements     |
                      |  - Disputes         |
                      +---------------------+
```

## Contract 1: material-registry

**Source:** `soroban/contracts/material-registry/src/lib.rs`

The material-registry is the canonical on-chain record for every educational material listed on ScholarMarket. It stores who created a material, what it costs, and how payouts should be split.

### What it does

- Registers new materials with immutable creator and metadata anchors
- Stores per-asset price quotes (e.g., "5 USDC" or "100 XLM")
- Defines payout splits for creators and collaborators
- Manages material status (active, paused, archived)
- Maintains a platform-level allowlist of approved payment assets

### What it does NOT do

- Accept buyer payments
- Hold or distribute funds
- Write entitlement state

### Storage design

Material state is split into two separate on-chain entries to minimize ledger rent costs:

| Storage key | Contents | Mutable? |
| --- | --- | --- |
| `MaterialCore(material_id)` | creator, metadata_uri, metadata_hash, rights_hash, created_ledger | No (write-once) |
| `MaterialSale(material_id)` | paused, status, quotes, payout_shares, updated_ledger | Yes |

When a creator updates prices or payout shares, only the `MaterialSale` entry is rewritten. The immutable `MaterialCore` entry stays the same.

### Material ID

Each material gets a unique 32-byte ID derived from:

```
material_id = SHA256(creator_address_xdr || nonce)
```

The nonce is a per-creator sequential counter, so material IDs are deterministic and unique without requiring a global counter.

### Key data structures

#### MaterialStatus

```text
Active   = 0    Material is available for purchase
Paused   = 1    Material exists but new purchases are blocked
Archived = 2    Material is hidden from marketplace
```

#### AssetQuote

Represents the price of a material in a specific Stellar asset.

| Field | Type | Description |
| --- | --- | --- |
| `asset` | `Address` | Stellar Asset Contract address (e.g., USDC contract) |
| `amount` | `i128` | Price in the smallest unit of the asset (e.g., 5000000 = 5 USDC with 6 decimals) |

A material can have up to 4 quotes, allowing buyers to pay in different assets.

#### PayoutShare

Defines how the seller's net revenue is distributed after the platform fee.

| Field | Type | Description |
| --- | --- | --- |
| `recipient` | `Address` | Stellar address that receives this share |
| `share_bps` | `u32` | Share in basis points (10000 = 100%) |

All payout shares for a material must sum to exactly 10,000 basis points. Up to 5 recipients are allowed.

#### MaterialRecord (full record)

The complete material record combines both storage entries:

| Field | Type | Description |
| --- | --- | --- |
| `material_id` | `BytesN<32>` | Unique identifier |
| `creator` | `Address` | Creator's Stellar address |
| `metadata_uri` | `String` | IPFS URI for off-chain metadata (max 256 bytes) |
| `metadata_hash` | `BytesN<32>` | SHA-256 hash of the canonical metadata JSON |
| `rights_hash` | `BytesN<32>` | SHA-256 hash of the license/rights document |
| `status` | `MaterialStatus` | Active, Paused, or Archived |
| `quotes` | `Vec<AssetQuote>` | Accepted payment assets and prices |
| `payout_shares` | `Vec<PayoutShare>` | Revenue split configuration |
| `created_ledger` | `u32` | Stellar ledger when registered |
| `updated_ledger` | `u32` | Stellar ledger when last modified |

### Entry points

| Function | Auth required | Description |
| --- | --- | --- |
| `register_material` | Creator | Creates a new material listing |
| `update_sale_terms` | Creator | Updates prices and payout splits |
| `set_material_status` | Creator or admin | Changes material status |
| `set_material_paused` | Creator or admin | Pauses/unpauses a material |
| `get_material` | None (public) | Returns the full MaterialRecord |
| `get_quote` | None (public) | Returns the quote for a specific asset |
| `set_asset_allowed` | Admin | Adds/removes an asset from the allowlist |
| `is_asset_allowed` | None (public) | Checks if an asset is approved |
| `set_upgrade_admin` | Current admin | Transfers admin role |
| `upgrade` | Admin | Replaces the contract WASM |
| `extend_materials_ttl` | None (permissionless) | Renews storage TTL for materials |

### Events emitted

| Event | When | Key data |
| --- | --- | --- |
| `MaterialRegisteredEvent` | New material created | material_id, creator, metadata, quotes, payout_shares |
| `MaterialSaleTermsUpdatedEvent` | Prices or payouts changed | material_id, new quotes, new payout_shares |
| `MaterialStatusUpdatedEvent` | Status changed | material_id, new status |
| `AssetPolicyUpdatedEvent` | Asset allowlist changed | asset address, enabled flag |

---

## Contract 2: purchase-manager

**Source:** `soroban/contracts/purchase-manager/src/lib.rs`

The purchase-manager handles the entire lifecycle of a buyer's purchase: validation, payment, escrow, dispute resolution, payout distribution, and entitlement tracking.

### What it does

- Validates that a material is purchasable (active, asset allowed, no duplicate entitlement)
- Collects payment from the buyer and routes funds atomically
- Holds the seller's net revenue in escrow during a dispute window
- Grants or revokes buyer entitlements
- Manages platform configuration (fees, treasury, pause state)
- Supports multi-seat licenses

### What it does NOT do

- Store material metadata (reads from material-registry via events)
- Store file content or IPFS links
- Transfer creator ownership

### Purchase lifecycle

Every purchase follows this state machine:

```text
  Buyer calls purchase()
         |
         v
    +---------+
    | Pending |  Escrow locked, entitlement granted
    +---------+
         |
    +----+----+-----------------------------------------+
    |         |                                         |
    v         v                                         v
  Buyer    Escrow lock period                    Admin calls
  opens    expires (35,000 ledgers)              refund_purchase
  dispute                                   
  (30,000                                     
  ledgers)                                   
    |         |                                         |
    v         v                                         v
+-----------+  +----------+                      +-----------+
| Disputed  |  | Released |                      | Refunded  |
+-----------+  +----------+                      +-----------+
    |               ^                                  ^
    +-------+-------+                                  |
            |                                          |
            v                                          |
    Admin resolves                                     |
    dispute                                            |
                                                       |
+-----------+  +-----------+                           |
| Released  |  | Refunded  | <-------------------------+
+-----------+  +-----------+
```

**Terminal states:** Released, Refunded, Expired

### Key data structures

#### PlatformConfig

Global platform settings stored in instance storage.

| Field | Type | Description |
| --- | --- | --- |
| `registry` | `Address` | Material registry contract address |
| `treasury` | `Address` | Address that receives platform fees |
| `platform_fee_bps` | `u32` | Platform fee in basis points (max 1000 = 10%) |
| `paused` | `bool` | Whether purchases are globally paused |
| `oracle` | `Option<Address>` | Optional price oracle (reserved for future use) |

#### EntitlementRecord

Proves that a buyer has purchased and retains access to a material.

| Field | Type | Description |
| --- | --- | --- |
| `material_id` | `BytesN<32>` | Material the buyer purchased |
| `buyer` | `Address` | Buyer's Stellar address |
| `active` | `bool` | Whether the entitlement is currently valid |
| `purchase_id` | `u64` | Reference to the original purchase |
| `asset` | `Address` | Asset used for payment |
| `amount` | `i128` | Amount paid |
| `granted_ledger` | `u32` | Ledger when entitlement was created |
| `seat_count` | `u32` | Total seats for multi-seat licenses |
| `remaining_seats` | `u32` | Seats not yet assigned |

Entitlements are unique per `(material_id, buyer)` pair. A buyer cannot purchase the same material twice.

#### EscrowRecord

Tracks funds held in the contract during the dispute window.

| Field | Type | Description |
| --- | --- | --- |
| `purchase_id` | `u64` | Purchase reference |
| `material_id` | `BytesN<32>` | Material purchased |
| `asset` | `Address` | Payment asset |
| `total_amount` | `i128` | Gross payment amount |
| `platform_fee` | `i128` | Fee sent to treasury |
| `seller_net` | `i128` | Amount held for creator |
| `payout_shares` | `Vec<PayoutShare>` | Revenue split configuration |
| `purchase_ledger` | `u32` | When the purchase occurred |
| `claimed` | `bool` | Whether payout has been distributed |

#### SettlementRecord

Tracks the resolution state of a purchase.

| Field | Type | Description |
| --- | --- | --- |
| `purchase_id` | `u64` | Purchase reference |
| `state` | `SettlementState` | Current state |
| `disputed_ledger` | `u32` | When dispute was opened (0 if none) |
| `resolved_ledger` | `u32` | When dispute was resolved (0 if unresolved) |
| `refunded_amount` | `i128` | Amount refunded (0 if not refunded) |

#### SettlementState

```text
Pending   = 0    Funds in escrow, dispute window open or not yet expired
Released  = 1    Payouts distributed to creators (terminal)
Disputed  = 2    Buyer opened a dispute, awaiting admin resolution
Refunded  = 3    Funds returned to buyer (terminal)
Expired    = 4    Purchase timed out without settlement (terminal)
```

#### DisputeRecord

Stores details when a buyer opens a dispute.

| Field | Type | Description |
| --- | --- | --- |
| `purchase_id` | `u64` | Purchase reference |
| `opener` | `Address` | Who opened the dispute |
| `reason` | `String` | Buyer's explanation |
| `opened_ledger` | `u32` | When the dispute was opened |
| `resolution` | `DisputeResolution` | How it was resolved |
| `resolved_ledger` | `u32` | When it was resolved |

#### CreatorTier

Creators are assigned fee tiers by the platform admin:

| Tier | Fee rate | Description |
| --- | --- | --- |
| Default | Configurable (max 10%) | Standard platform fee |
| Tier1 | 2.5% (250 bps) | Reduced fee for established creators |
| Tier2 | 1.5% (150 bps) | Lowest fee for top creators |

### Entry points

| Function | Auth required | Description |
| --- | --- | --- |
| `initialize` | Admin | One-time setup: sets registry, treasury, fee |
| `purchase` | Buyer | Complete purchase: validate, pay, escrow, grant entitlement |
| `assign_seat` | Purchaser | Assign a seat from a multi-seat license |
| `has_entitlement` | None (public) | Check if a buyer has active access |
| `get_entitlement` | None (public) | Get full entitlement details |
| `withdraw_payouts` | Payout recipient | Release escrowed funds after lock period |
| `open_dispute` | Buyer | Open a dispute within the dispute window |
| `resolve_dispute` | Admin | Resolve a dispute (refund or release) |
| `refund_purchase` | Admin | Refund a purchase without a dispute |
| `get_escrow_record` | None (public) | Get escrow details for a purchase |
| `get_settlement` | None (public) | Get settlement state for a purchase |
| `set_asset_allowed` | Admin | Manage the asset allowlist |
| `set_platform_config` | Admin | Update treasury, fee, or pause state |
| `set_creator_tier` | Admin | Assign a fee tier to a creator |
| `pause` / `unpause` | Admin | Globally pause/unpause purchases |
| `upgrade` | Admin | Replace the contract WASM |
| `extend_purchases_ttl` | None (permissionless) | Renew storage TTL for purchases |

### Events emitted

| Event | When | Key data |
| --- | --- | --- |
| `PurchaseCompletedEvent` | Purchase succeeds | purchase_id, material_id, buyer, amount, fee, seller_net |
| `PayoutDistributedEvent` | Payout released | purchase_id, recipient, role, amount |
| `EscrowCreatedEvent` | Funds escrowed | purchase_id, asset, amount, lock_until_ledger |
| `EscrowReleasedEvent` | Payout claimed | purchase_id, amount |
| `DisputeOpenedEvent` | Dispute filed | purchase_id, opener, reason |
| `DisputeResolvedEvent` | Dispute resolved | purchase_id, resolution |
| `PurchaseRefundedEvent` | Refund processed | purchase_id, buyer, refund_amount |
| `AssetPolicyUpdatedEvent` | Allowlist changed | asset, enabled |
| `PlatformConfigUpdatedEvent` | Config changed | treasury, fee, paused |
| `AdminTransferInitiatedEvent` | Admin transfer started | from, pending_admin |
| `CreatorTierUpdatedEvent` | Tier assigned | creator, tier |
| `SeatAssignedEvent` | Seat assigned | material_id, purchaser, assignee, remaining |

---

## How Funds Flow During a Purchase

This section traces exactly what happens when a buyer purchases a material for 5 USDC.

### Step-by-step flow

```text
1. BUYER calls purchase(material_id, usdc_asset, 5_000_000)
   |
   |  Contract validates:
   |    - Material exists and is Active
   |    - USDC is in the material's quotes for 5_000_000
   |    - USDC is in the platform allowlist
   |    - Buyer has no existing entitlement for this material
   |
   v

2. FEE CALCULATION
   |
   |  platform_fee = 5_000_000 * fee_bps / 10_000
   |  (e.g., 250 bps tier = 125_000 USDC units = 0.125 USDC)
   |
   |  seller_net = 5_000_000 - 125_000 = 4_875_000
   |
   v

3. TRANSFERS (atomic, all-or-nothing)
   |
   |  +--> Buyer --[125_000]--> Treasury (platform fee)
   |  |
   |  +--> Buyer --[4_875_000]--> PurchaseManager contract (escrow)
   |
   v

4. STATE WRITES (same transaction)
   |
   |  - EscrowRecord created (seller_net held in contract)
   |  - EntitlementRecord created (buyer can access material)
   |  - SettlementRecord created (state = Pending)
   |
   v

5. EVENT EMITTED: PurchaseCompletedEvent
   |
   |  Indexer picks up event and writes to MongoDB:
   |    - purchases collection (status: settled)
   |    - entitlement_cache collection (active: true)
   |
   v

6. AFTER 35,000 LEDGERS (dispute window expires)
   |
   |  Creator or collaborator calls withdraw_payouts(purchase_id)
   |
   |  Contract distributes from escrow:
   |    - Creator receives their share based on payout_shares
   |    - Collaborators receive their shares
   |
   |  Settlement state: Pending --> Released
   |
   v

7. BUYER accesses material
   |
   |  Backend checks entitlement:
   |    1. entitlement_cache (fast path)
   |    2. purchases collection (fallback)
   |    3. On-chain has_entitlement() (ultimate fallback)
   |
   |  If active --> grant access to IPFS-pinned content
```

### Fee calculation examples

| Platform fee (bps) | Tier | 5 USDC purchase | Fee | Seller net |
| --- | --- | --- | --- | --- |
| 250 | Tier1 | 5.000 USDC | 0.125 USDC | 4.875 USDC |
| 150 | Tier2 | 5.000 USDC | 0.075 USDC | 4.925 USDC |
| 500 | Default | 5.000 USDC | 0.250 USDC | 4.750 USDC |
| 1000 | Default (max) | 5.000 USDC | 0.500 USDC | 4.500 USDC |

### Payout split example

If a material has these payout shares and the seller net is 4.875 USDC:

```text
Payout Shares:
  Creator (GABC...)    7000 bps  -->  3.4125 USDC
  Collaborator (GDEF)  2000 bps  -->  0.9750 USDC
  Institution (GHIJ)   1000 bps  -->  0.4875 USDC
                       --------     ----------
                       10000 bps     4.875 USDC
```

---

## Cross-Contract Interaction

The two contracts do not call each other. Instead, the off-chain indexer bridges them:

```text
material-registry                    purchase-manager
        |                                    |
        |  MaterialRegisteredEvent           |
        +---> Indexer writes to MongoDB      |
        |                                    |
        |                     PurchaseCompletedEvent
        |              +---> Indexer writes to MongoDB
        |              |     (purchases + entitlement_cache)
        |              |
        v              v
   +---------+    +----------+
   | MongoDB |    | On-chain |
   | Cache   |    | State    |
   +---------+    +----------+
        |
        v
   Backend API serves
   frontend queries
```

### Entitlement verification cascade

When the backend needs to check if a buyer can access a material:

1. **Cache hit** -- Check `entitlement_cache` collection. If active, verify on-chain settlement hasn't been refunded.
2. **Purchases DB fallback** -- Check `purchases` collection for a completed purchase record.
3. **On-chain fallback** -- Simulate `has_entitlement()` via Soroban RPC.
4. **Settlement check** -- Simulate `get_settlement_state()` to detect refunds.

Each successful read organically extends the on-chain storage TTL.

---

## Storage Model

### material-registry storage keys

| Key | Type | Description |
| --- | --- | --- |
| `UpgradeAdmin` | instance | Current upgrade admin address |
| `CreatorNonce(Address)` | persistent | Per-creator material counter |
| `MaterialCore(BytesN<32>)` | persistent | Immutable material data |
| `MaterialSale(BytesN<32>)` | persistent | Mutable sale configuration |
| `AllowedAsset(Address)` | persistent | Asset allowlist entries |
| `MaterialIndex(u64)` | persistent | Material enumeration index |
| `MaterialCount` | instance | Total materials registered |
| `AllowedAssetIndex(u64)` | persistent | Asset enumeration index |
| `AllowedAssetCount` | instance | Total allowed assets |

### purchase-manager storage keys

| Key | Type | Description |
| --- | --- | --- |
| `PlatformConfig` | instance | Global platform settings |
| `PurchaseNonce` | instance | Global purchase counter |
| `PendingAdmin` | instance | Pending admin transfer |
| `AllowedAsset(Address)` | persistent | Asset allowlist entries |
| `Entitlement((BytesN<32>, Address))` | persistent | Buyer entitlement per material |
| `Escrow(u64)` | persistent | Escrow record per purchase |
| `Settlement(u64)` | persistent | Settlement state per purchase |
| `Dispute(u64)` | persistent | Dispute record per purchase |
| `PurchaseBuyer(u64)` | persistent | Buyer address per purchase |
| `CreatorTier(Address)` | persistent | Fee tier per creator |

---

## Validation Rules

### Material registration

| Rule | Limit |
| --- | --- |
| `metadata_uri` | Non-empty, max 256 bytes |
| Quotes per material | Max 4 |
| Quote amounts | Must be > 0 |
| Duplicate assets in quotes | Not allowed |
| Payout recipients per material | Max 5 |
| Payout share range | 1 -- 10,000 bps |
| Total payout shares | Must equal exactly 10,000 bps |
| Duplicate payout recipients | Not allowed |

### Purchase

| Rule | Value |
| --- | --- |
| Material must be `Active` | Required |
| Asset must be in material quotes | Required |
| Asset must be in platform allowlist | Required |
| No existing active entitlement | Required |
| Platform fee cap | Max 1,000 bps (10%) |
| Dispute window | 30,000 ledgers |
| Escrow lock period | 35,000 ledgers |
| TTL renewal batch size | Max 25 per sweep |

---

## Authorization model

### material-registry

| Operation | Who can call |
| --- | --- |
| Register material | Creator (must sign) |
| Update sale terms | Creator (must sign) |
| Change material status | Creator or upgrade admin |
| Manage asset allowlist | Upgrade admin only |
| Upgrade contract | Upgrade admin only |

### purchase-manager

| Operation | Who can call |
| --- | --- |
| Make a purchase | Buyer (must sign) |
| Open a dispute | Buyer (must sign) |
| Assign a seat | Purchaser (must sign) |
| Withdraw payouts | Payout recipient (must sign) |
| Resolve disputes | Admin only |
| Process refunds | Admin only |
| Platform config changes | Admin only |
| Upgrade contract | Admin only |

Admin role is managed through persistent storage grants, not Soroban instance roles. The `require_admin` function checks both that the caller has auth and holds the admin role.

---

## TTL Maintenance

Both contracts store data in persistent storage, which has a Stellar ledger TTL. To prevent data from being garbage-collected, the contracts expose permissionless TTL renewal functions:

| Function | Contract | What it extends |
| --- | --- | --- |
| `extend_materials_ttl` | material-registry | Material storage entries |
| `extend_asset_policy_ttl` | material-registry | Asset allowlist entries |
| `extend_purchases_ttl` | purchase-manager | Escrow and entitlement records |
| `extend_allowed_asset_ttl` | purchase-manager | Asset allowlist entries |
| `extend_creator_tier_ttl` | purchase-manager | Creator tier assignments |
| `extend_admin_role_ttl` | purchase-manager | Admin role grants |

These functions use cursor-based pagination with a batch cap of 25 entries per call. They renew TTL when remaining ledger life drops below half the maximum. Anyone can call them (permissionless) to keep the network healthy.

---

## Building and deploying

See [SOROBAN_DEPLOYMENT.md](SOROBAN_DEPLOYMENT.md) for build commands, WASM optimization, and deployment instructions.

See [soroban-upgrade-pattern.md](soroban-upgrade-pattern.md) for the upgrade strategy and admin transfer process.

See [ttl-operations.md](ttl-operations.md) for TTL maintenance scheduling and monitoring.
