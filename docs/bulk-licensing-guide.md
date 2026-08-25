# Bulk Licensing User Guide

This guide walks school administrators and organization leaders through purchasing and distributing multi-seat licenses on ScholarMarket. Bulk licensing allows an institution to buy access to educational materials in volume and assign seats to students, teachers, or staff.

> **Note:** Bulk licensing is a planned feature. This guide describes the intended workflow and will be updated as the feature is implemented.

## Overview

ScholarMarket bulk licensing lets you:

- Purchase multiple seats for a single material or collection in one transaction.
- Manage seat assignments from an organization dashboard.
- Revoke and reassign seats as membership changes.
- Track usage and entitlement status across your organization.

## Prerequisites

Before you begin, make sure you have:

1. **A Stellar wallet** — Install [Freighter](https://freighter.app) or another Stellar-compatible browser extension and fund it with enough XLM to cover the purchase and transaction fees.
2. **An organization profile** — Create or join an organization from your ScholarMarket dashboard under **Settings > Organization**.
3. **Admin permissions** — You must have the **Admin** or **Billing** role within the organization to initiate purchases and manage seats.

## Purchasing a Bulk License

### Step 1: Find the Material

1. Open the [ScholarMarket Marketplace](/marketplace).
2. Browse or search for the material you want to license for your organization.
3. Open the material detail page.

### Step 2: Start a Bulk Purchase

1. On the material detail page, click **Bulk Purchase** (instead of the single-seat **Buy Now** button).
2. Enter the number of seats you need. The total price updates automatically.
3. Review the pricing breakdown, including any applicable volume discounts and taxes.
4. Optionally enter a **discount code** if your institution has one.

### Step 3: Confirm and Pay

1. Click **Proceed to Checkout**.
2. Your Stellar wallet extension will prompt you to sign a transaction.
3. Review the transaction details — the total amount, recipient (material creator), and platform fee.
4. Click **Sign** to authorize the payment.
5. Wait for the transaction to confirm on the Stellar network.

Once the transaction is confirmed:

- The seats are allocated to your organization.
- An **order receipt** is displayed with the transaction hash and seat count.
- You receive a confirmation email at your registered address.

## Managing Licenses

After purchasing, manage your licenses from the **Organization Dashboard**.

### Accessing the Dashboard

1. Go to **Dashboard > Organization** from the top navigation.
2. You will see your organization's purchased materials, seat counts, and assignment status.

### Assigning Seats

1. Open the material row you want to manage.
2. Click **Manage Seats**.
3. You can assign seats in two ways:

   - **Manual assignment** — Enter the Stellar wallet address or email of the recipient and click **Assign**. The recipient receives an entitlement granting them access.
   - **Bulk assignment** — Upload a CSV file with a list of wallet addresses (one per line). Click **Upload & Assign** to process all entries at once.

4. Click **Confirm** to finalize the assignments.

### Viewing Assigned Users

The seat management panel shows a table of all assigned users with:

| Column | Description |
|--------|-------------|
| Wallet Address | The recipient's Stellar public key |
| Email | The email linked to their ScholarMarket profile |
| Assigned Date | When the seat was assigned |
| Status | Active, Revoked, or Pending |

### Revoking and Reassigning Seats

If a student leaves or a teacher no longer needs access:

1. Open the seat management panel for the material.
2. Find the user in the table.
3. Click **Revoke** next to their row.
4. Confirm the revocation.
5. The seat becomes available again and can be reassigned to another user.

Revoked users immediately lose access to the material.

## Tracking Usage

The Organization Dashboard provides an overview of:

- **Total seats purchased** vs. **seats assigned** vs. **seats available**.
- **Recent activity** — who was assigned or revoked, and when.
- **Transaction history** — links to on-chain transaction hashes for every purchase and entitlement event.

## Frequently Asked Questions

**Can I purchase bulk licenses for multiple materials at once?**

Yes. During checkout, you can add multiple materials to a bulk order. Each material's seats are tracked independently.

**What happens if I assign a seat to a wallet address that does not exist?**

The assignment will be queued as **Pending**. Once the recipient connects a wallet with that address to ScholarMarket, the entitlement activates automatically.

**Can I transfer my organization's licenses to another organization?**

Not at this time. Licenses are tied to the purchasing organization. If you need to transfer ownership, contact ScholarMarket support.

**Is there a volume discount?**

Volume discounts may apply depending on the material creator's pricing settings and your organization's tier. The checkout page will display the final discounted price before you confirm.

**How do I get a refund?**

Refund requests are handled through **Dashboard > Organization > Transaction History > Request Refund**. Refund eligibility depends on the material creator's refund policy and the number of seats already assigned.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Wallet does not prompt for signing | Make sure your Freighter extension is unlocked and connected to the Stellar network. Refresh the page if needed. |
| Transaction is pending for a long time | Stellar transactions typically confirm in 2–5 seconds. If it takes longer, check the transaction hash on [Stellar Explorer](https://stellar.expert). |
| Assigned user cannot access the material | Verify the user's wallet address matches the one you entered. They must be logged in with that wallet on ScholarMarket. |
| Upload CSV fails | Ensure the CSV contains one wallet address per line with no headers. Use plain text encoding (UTF-8). |

## Next Steps

- Review the [Purchase Flow Architecture](purchase-flow-architecture.md) for technical details on how entitlements work.
- See the [Soroban Contract Architecture](soroban-contract-architecture.md) for how purchases and entitlements are recorded on-chain.
- Read the [User Flows](user-flows.md) guide for an overview of the buyer and creator journeys.
