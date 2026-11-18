import assert from "node:assert/strict";
import { test, mock } from "node:test";
import {
  Keypair,
  Networks,
  Memo,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  issueChallenge,
  verifyChallenge,
  CHALLENGE_TTL_MS,
} from "../../src/lib/auth/challenge.js";

function createDb() {
  const challenges = [];
  return {
    challenges,
    collection(name) {
      assert.equal(name, "auth_challenges");
      return {
        async insertOne(doc) { challenges.push({ ...doc, _id: String(challenges.length + 1) }); },
        async findOne(query) {
          return challenges.find((challenge) =>
            challenge.address === query.address &&
            challenge.nonce === query.nonce &&
            challenge.used === query.used &&
            challenge.expiresAt > query.expiresAt.$gt
          ) || null;
        },
        async updateOne(filter, update) {
          const challenge = challenges.find((item) => item._id === filter._id);
          if (challenge) Object.assign(challenge, update.$set);
        },
      };
    },
  };
}

function signChallenge(keypair, nonce, source = keypair.publicKey()) {
  const account = {
    accountId: () => source,
    sequence: "0",
    sequenceNumber: () => "0",
    incrementSequenceNumber: function () { this.sequence = "1"; },
  };
  const tx = new TransactionBuilder(account, {
    networkPassphrase: Networks.TESTNET,
    fee: "100",
  })
    .addOperation(Operation.manageData({ name: "wallet_challenge", value: nonce }))
    .setTimeout(30)
    .addMemo(Memo.text(nonce))
    .build();
  tx.sign(keypair);
  return tx.toXDR();
}

test("valid signature from the challenged address succeeds", async () => {
  const db = createDb();
  const keypair = Keypair.random();
  const challenge = await issueChallenge(keypair.publicKey(), { db });
  const xdr = signChallenge(keypair, challenge.nonce);
  const result = await verifyChallenge(keypair.publicKey(), challenge.nonce, xdr, { db });
  assert.ok(result.valid, result.reason);
  assert.equal(result.valid, true);
});

test("signature from a different keypair fails", async () => {
  const db = createDb();
  const challenged = Keypair.random();
  const other = Keypair.random();
  const challenge = await issueChallenge(challenged.publicKey(), { db });
  const xdr = signChallenge(other, challenge.nonce, challenged.publicKey());
  const result = await verifyChallenge(challenged.publicKey(), challenge.nonce, xdr, { db });
  assert.equal(result.valid, false);
});

test("expired challenge fails using fake timers", async () => {
  mock.timers.enable({ apis: ["Date"] });
  try {
    mock.timers.setTime(Date.now());
    const db = createDb();
    const keypair = Keypair.random();
    const challenge = await issueChallenge(keypair.publicKey(), { db });
    db.challenges[0].expiresAt = new Date(Date.now() - CHALLENGE_TTL_MS - 1);
    const xdr = signChallenge(keypair, challenge.nonce);
    const result = await verifyChallenge(keypair.publicKey(), challenge.nonce, xdr, { db });
    assert.equal(result.valid, false);
  } finally {
    mock.timers.reset();
  }
});

test("reusing a consumed nonce fails", async () => {
  const db = createDb();
  const keypair = Keypair.random();
  const challenge = await issueChallenge(keypair.publicKey(), { db });
  const xdr = signChallenge(keypair, challenge.nonce);
  assert.equal((await verifyChallenge(keypair.publicKey(), challenge.nonce, xdr, { db })).valid, true);
  assert.equal((await verifyChallenge(keypair.publicKey(), challenge.nonce, xdr, { db })).valid, false);
});

test("tampered address or domain fails", async () => {
  const db = createDb();
  const keypair = Keypair.random();
  const challenge = await issueChallenge(keypair.publicKey(), { db, origin: "https://one.example" });
  const xdr = signChallenge(keypair, challenge.nonce);
  assert.equal((await verifyChallenge(Keypair.random().publicKey(), challenge.nonce, xdr, { db })).valid, false);
  assert.equal((await verifyChallenge(keypair.publicKey(), challenge.nonce, xdr, {
    db,
    origin: "https://two.example",
  })).valid, false);
});
