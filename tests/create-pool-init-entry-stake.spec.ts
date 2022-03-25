// import type * as splToken from "@solana/spl-token";
import * as web3 from "@solana/web3.js";
import * as splToken from "@solana/spl-token";
import { BN } from "@project-serum/anchor";
import {
  withCreateEntry,
  withCreatePool,
  withStake,
  withUnstake,
  // withStake,
} from "../src/programs/stakePool/transaction";
import { expectTXTable } from "@saberhq/chai-solana";
import { SolanaProvider, TransactionEnvelope } from "@saberhq/solana-contrib";

import { createMint } from "./utils";
import { expect } from "chai";
import { getProvider } from "./workspace";
import {
  getStakeEntry,
  getStakePool,
} from "../src/programs/stakePool/accounts";
import {
  findStakeEntryId,
  findStakePoolId,
} from "../src/programs/stakePool/pda";

describe("Create stake pool", () => {
  const poolIdentifier = new BN(getRandomInt(1000));
  const entryName = "name";
  const symbol = "symbol";
  const textOverlay = "staking";
  let originalMint: splToken.Token;
  const mint = web3.Keypair.generate();
  const originalMintAuthority = web3.Keypair.generate();

  before(async () => {
    const provider = getProvider();
    // original mint
    [, originalMint] = await createMint(
      provider.connection,
      originalMintAuthority,
      provider.wallet.publicKey
    );
  });

  it("Create Pool", async () => {
    const provider = getProvider();
    const transaction = new web3.Transaction();
    await withCreatePool(transaction, provider.connection, provider.wallet, {
      identifier: poolIdentifier,
    });
    const txEnvelope = new TransactionEnvelope(
      SolanaProvider.init({
        connection: provider.connection,
        wallet: provider.wallet,
        opts: provider.opts,
      }),
      [...transaction.instructions]
    );

    await expectTXTable(txEnvelope, "test", {
      verbosity: "error",
      formatLogs: true,
    }).to.be.fulfilled;

    let [stakePoolId] = await findStakePoolId(poolIdentifier);
    const stakePoolData = await getStakePool(provider.connection, stakePoolId);

    expect(stakePoolData.parsed.identifier.toNumber()).to.eq(
      poolIdentifier.toNumber()
    );
  });

  it("Init stake entry for pool", async () => {
    const provider = getProvider();
    const transaction = new web3.Transaction();

    await withCreateEntry(transaction, provider.connection, provider.wallet, {
      mint: mint,
      stakePoolIdentifier: poolIdentifier,
      originalMint: originalMint.publicKey,
      name: entryName,
      symbol: symbol,
      textOverlay: textOverlay,
    });

    const txEnvelope = new TransactionEnvelope(
      SolanaProvider.init({
        connection: provider.connection,
        wallet: provider.wallet,
        opts: provider.opts,
      }),
      [...transaction.instructions],
      [mint]
    );

    await expectTXTable(txEnvelope, "test", {
      verbosity: "error",
      formatLogs: true,
    }).to.be.fulfilled;

    const [[stakePoolId], [stakeEntryId]] = await Promise.all([
      findStakePoolId(poolIdentifier),
      findStakeEntryId(poolIdentifier, originalMint.publicKey),
    ]);

    const stakeEntryData = await getStakeEntry(
      provider.connection,
      stakeEntryId
    );

    expect(stakeEntryData.parsed.originalMint.toString()).to.eq(
      originalMint.publicKey.toString()
    );
    expect(stakeEntryData.parsed.pool.toString()).to.eq(stakePoolId.toString());
    expect(stakeEntryData.parsed.mint.toString()).to.eq(
      mint.publicKey.toString()
    );
  });

  it("Stake", async () => {
    const provider = getProvider();
    const transaction = new web3.Transaction();

    await withStake(transaction, provider.connection, provider.wallet, {
      stakePoolIdentifier: poolIdentifier,
      originalMint: originalMint.publicKey,
      mint: mint.publicKey,
    });

    const txEnvelope = new TransactionEnvelope(
      SolanaProvider.init({
        connection: provider.connection,
        wallet: provider.wallet,
        opts: provider.opts,
      }),
      [...transaction.instructions]
    );
    await expectTXTable(txEnvelope, "test", {
      verbosity: "error",
      formatLogs: true,
    }).to.be.fulfilled;

    let [stakeEntryId] = await findStakeEntryId(
      poolIdentifier,
      originalMint.publicKey
    );
    const stakeEntryData = await getStakeEntry(
      provider.connection,
      stakeEntryId
    );

    const userOriginalMintTokenAccountId = await getAta(
      originalMint.publicKey,
      provider.wallet.publicKey,
      true
    );

    const userMintTokenAccountId = await getAta(
      mint.publicKey,
      provider.wallet.publicKey,
      true
    );

    const stakeEntryOriginalMintTokenAccountId = await getAta(
      originalMint.publicKey,
      stakeEntryData.pubkey,
      true
    );

    const stakeEntryMintTokenAccountId = await getAta(
      mint.publicKey,
      stakeEntryData.pubkey,
      true
    );

    expect(stakeEntryData.parsed.lastStakedAt.toNumber()).to.be.greaterThan(0);
    expect(stakeEntryData.parsed.lastStaker.toString()).to.eq(
      provider.wallet.publicKey.toString()
    );

    const checkMint = new splToken.Token(
      provider.connection,
      mint.publicKey,
      splToken.TOKEN_PROGRAM_ID,
      // @ts-ignore
      null
    );

    const checkUserMintTokenAccount = await checkMint.getAccountInfo(
      userMintTokenAccountId
    );
    expect(checkUserMintTokenAccount.amount.toNumber()).to.eq(1);

    const checkStakeEntryMintTokenAccount = await checkMint.getAccountInfo(
      stakeEntryMintTokenAccountId
    );
    expect(checkStakeEntryMintTokenAccount.amount.toNumber()).to.eq(0);

    const checkUserOriginalTokenAccount = await originalMint.getAccountInfo(
      userOriginalMintTokenAccountId
    );
    expect(checkUserOriginalTokenAccount.amount.toNumber()).to.eq(0);

    const checkStakeEntryOriginalMintTokenAccount =
      await originalMint.getAccountInfo(stakeEntryOriginalMintTokenAccountId);
    expect(checkStakeEntryOriginalMintTokenAccount.amount.toNumber()).to.eq(1);
  });

  it("Unstake", async () => {
    const provider = getProvider();
    const transaction = new web3.Transaction();

    await withUnstake(transaction, provider.connection, provider.wallet, {
      stakePoolIdentifier: poolIdentifier,
      originalMint: originalMint.publicKey,
      mint: mint.publicKey,
    });

    const txEnvelope = new TransactionEnvelope(
      SolanaProvider.init({
        connection: provider.connection,
        wallet: provider.wallet,
        opts: provider.opts,
      }),
      [...transaction.instructions]
    );
    await expectTXTable(txEnvelope, "test", {
      verbosity: "error",
      formatLogs: true,
    }).to.be.fulfilled;

    let [stakeEntryId] = await findStakeEntryId(
      poolIdentifier,
      originalMint.publicKey
    );
    const stakeEntryData = await getStakeEntry(
      provider.connection,
      stakeEntryId
    );

    expect(stakeEntryData.parsed.lastStaker.toString()).to.eq(
      web3.PublicKey.default.toString()
    );
    expect(stakeEntryData.parsed.lastStakedAt.toNumber()).to.gt(0);

    const checkMint = new splToken.Token(
      provider.connection,
      mint.publicKey,
      splToken.TOKEN_PROGRAM_ID,
      // @ts-ignore
      null
    );

    const userOriginalMintTokenAccountId = await getAta(
      originalMint.publicKey,
      provider.wallet.publicKey,
      true
    );

    const userMintTokenAccountId = await getAta(
      mint.publicKey,
      provider.wallet.publicKey,
      true
    );

    const stakeEntryOriginalMintTokenAccountId = await getAta(
      originalMint.publicKey,
      stakeEntryData.pubkey,
      true
    );

    const stakeEntryMintTokenAccountId = await getAta(
      mint.publicKey,
      stakeEntryData.pubkey,
      true
    );

    const checkUserMintTokenAccount = await checkMint.getAccountInfo(
      userMintTokenAccountId
    );
    expect(checkUserMintTokenAccount.amount.toNumber()).to.eq(0);

    const checkStakeEntryMintTokenAccount = await checkMint.getAccountInfo(
      stakeEntryMintTokenAccountId
    );
    expect(checkStakeEntryMintTokenAccount.amount.toNumber()).to.eq(1);

    const checkUserOriginalTokenAccount = await originalMint.getAccountInfo(
      userOriginalMintTokenAccountId
    );
    expect(checkUserOriginalTokenAccount.amount.toNumber()).to.eq(1);

    const checkStakeEntryOriginalMintTokenAccount =
      await originalMint.getAccountInfo(stakeEntryOriginalMintTokenAccountId);
    expect(checkStakeEntryOriginalMintTokenAccount.amount.toNumber()).to.eq(0);
  });
});

function getRandomInt(max: number) {
  return Math.floor(Math.random() * max);
}

const getAta = async (
  mint: web3.PublicKey,
  owner: web3.PublicKey,
  allowOwnerOffCurve?: true
): Promise<web3.PublicKey> => {
  const associatedAddress = await splToken.Token.getAssociatedTokenAddress(
    splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
    splToken.TOKEN_PROGRAM_ID,
    mint,
    owner,
    allowOwnerOffCurve
  );
  return associatedAddress;
};