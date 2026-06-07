const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("PerpEngine", function () {
  let perpEngine, oracle, vault;
  let owner, trader1, trader2, liquidator;

  const INITIAL_PRICE = 50000n; // $0.050000 in 6 decimals
  const COLLATERAL    = ethers.parseEther("0.1");
  const SEED_AMOUNT   = ethers.parseEther("10");

 beforeEach(async () => {
  [owner, trader1, trader2, liquidator] = await ethers.getSigners();

  oracle = await ethers.deployContract("OracleKeeper", [INITIAL_PRICE]);
  vault = await ethers.deployContract("LiquidityVault", []);
  perpEngine = await ethers.deployContract("PerpEngine", [
    await oracle.getAddress(),
    await vault.getAddress()
  ]);

  await vault.setPerpEngine(await perpEngine.getAddress());
  await vault.connect(owner).deposit({ value: SEED_AMOUNT });
});

  /* ─────────────────────────────────────────────
     TEST 1: Open LONG position
  ───────────────────────────────────────────── */
  it("1. Opens a LONG position correctly", async () => {
    const tx = await perpEngine.connect(trader1).openLong(2, { value: COLLATERAL });
    await tx.wait();

    const pos = await perpEngine.getPosition(0);
    expect(pos.trader).to.equal(trader1.address);
    expect(pos.isLong).to.be.true;
    expect(pos.leverage).to.equal(2);
    expect(pos.collateral).to.equal(COLLATERAL);
    expect(pos.positionSize).to.equal(COLLATERAL * 2n);
    expect(pos.isOpen).to.be.true;
    expect(pos.entryPrice).to.equal(INITIAL_PRICE);
  });

  /* ─────────────────────────────────────────────
     TEST 2: Open SHORT position
  ───────────────────────────────────────────── */
  it("2. Opens a SHORT position correctly", async () => {
    await perpEngine.connect(trader1).openShort(5, { value: COLLATERAL });

    const pos = await perpEngine.getPosition(0);
    expect(pos.isLong).to.be.false;
    expect(pos.leverage).to.equal(5);
    expect(pos.isOpen).to.be.true;

    // SHORT liq price = entry + entry/leverage
    const expectedLiq = INITIAL_PRICE + INITIAL_PRICE / 5n;
    expect(pos.liquidationPrice).to.equal(expectedLiq);
  });

  /* ─────────────────────────────────────────────
     TEST 3: Close LONG with profit
  ───────────────────────────────────────────── */
  it("3. Closes LONG position with profit when price goes up", async () => {
    await perpEngine.connect(trader1).openLong(2, { value: COLLATERAL });

    // Price goes up 10%
    const newPrice = INITIAL_PRICE * 110n / 100n;
    await oracle.setPrice(newPrice);

    const balBefore = await ethers.provider.getBalance(trader1.address);
    const closeTx   = await perpEngine.connect(trader1).closePosition(0);
    const receipt   = await closeTx.wait();
    const gasUsed = receipt.gasUsed * receipt.gasPrice;
    const balAfter  = await ethers.provider.getBalance(trader1.address);

    // Trader should have more than they started with (profit > gas)
    expect(balAfter + gasUsed).to.be.gt(balBefore + COLLATERAL);

    const pos = await perpEngine.getPosition(0);
    expect(pos.isOpen).to.be.false;
  });

  /* ─────────────────────────────────────────────
     TEST 4: Close LONG with loss
  ───────────────────────────────────────────── */
  it("4. Closes LONG position with loss when price goes down", async () => {
    await perpEngine.connect(trader1).openLong(2, { value: COLLATERAL });

    // Price drops 5%
    const newPrice = INITIAL_PRICE * 95n / 100n;
    await oracle.setPrice(newPrice);

    const balBefore = await ethers.provider.getBalance(trader1.address);
    const closeTx   = await perpEngine.connect(trader1).closePosition(0);
    const receipt   = await closeTx.wait();
    const gasUsed = receipt.gasUsed * receipt.gasPrice;
    const balAfter  = await ethers.provider.getBalance(trader1.address);

    // Trader gets back less than collateral
    expect(balAfter + gasUsed).to.be.lt(balBefore + COLLATERAL);

    // PnL should be negative
    const pnl = await perpEngine.realizedPnL(trader1.address);
    expect(pnl).to.be.lt(0n);
  });

  /* ─────────────────────────────────────────────
     TEST 5: Liquidation executes correctly
  ───────────────────────────────────────────── */
  it("5. Liquidates a LONG position when price hits liquidation", async () => {
    await perpEngine.connect(trader1).openLong(2, { value: COLLATERAL });
    const pos = await perpEngine.getPosition(0);

    // Set price AT liquidation price
    await oracle.setPrice(pos.liquidationPrice);

    const liqBefore = await ethers.provider.getBalance(liquidator.address);
    const liqTx     = await perpEngine.connect(liquidator).liquidate(0);
    const receipt   = await liqTx.wait();
    const gasUsed    = receipt.gasUsed * liqTx.gasPrice;
    const liqAfter  = await ethers.provider.getBalance(liquidator.address);

    // Liquidator receives 5% bonus
    const expectedBonus = COLLATERAL * 500n / 10000n;
    expect(liqAfter + gasUsed - liqBefore).to.be.closeTo(expectedBonus, ethers.parseEther("0.0001"));

    const closedPos = await perpEngine.getPosition(0);
    expect(closedPos.isOpen).to.be.false;
  });

  /* ─────────────────────────────────────────────
     TEST 6: Cannot liquidate healthy position
  ───────────────────────────────────────────── */
  it("6. Reverts liquidation of healthy position", async () => {
    await perpEngine.connect(trader1).openLong(2, { value: COLLATERAL });

    // Price stays at entry — healthy
    await expect(
      perpEngine.connect(liquidator).liquidate(0)
    ).to.be.revertedWith("Not liquidatable");
  });

  /* ─────────────────────────────────────────────
     TEST 7: Health factor calculation
  ───────────────────────────────────────────── */
  it("7. Health factor starts at 100 and drops as price moves against position", async () => {
    await perpEngine.connect(trader1).openLong(2, { value: COLLATERAL });

    // At entry price — health should be 100
    const healthAtEntry = await perpEngine.getHealthFactor(0);
    expect(healthAtEntry).to.equal(100n);

    // Price drops halfway to liquidation
    const pos = await perpEngine.getPosition(0);
    const midPrice = (pos.entryPrice + pos.liquidationPrice) / 2n;
    await oracle.setPrice(midPrice);

    const healthMid = await perpEngine.getHealthFactor(0);
    expect(healthMid).to.be.gt(0n);
    expect(healthMid).to.be.lt(100n);

    // At liquidation price — health should be 0
    await oracle.setPrice(pos.liquidationPrice);
    const healthAtLiq = await perpEngine.getHealthFactor(0);
    expect(healthAtLiq).to.equal(0n);
  });

  /* ─────────────────────────────────────────────
     TEST 8: Leaderboard tracks PnL correctly
  ───────────────────────────────────────────── */
  it("8. Leaderboard tracks realized PnL for multiple traders", async () => {
    // Trader1 opens and closes with profit
    await perpEngine.connect(trader1).openLong(2, { value: COLLATERAL });
    await oracle.setPrice(INITIAL_PRICE * 110n / 100n); // +10%
    await perpEngine.connect(trader1).closePosition(0);

    // Trader2 opens and closes with loss
    await oracle.setPrice(INITIAL_PRICE); // reset
    await perpEngine.connect(trader2).openShort(2, { value: COLLATERAL });
    await oracle.setPrice(INITIAL_PRICE * 105n / 100n); // price up, short loses
    await perpEngine.connect(trader2).closePosition(1);

    const [addrs, pnls] = await perpEngine.getLeaderboard();
    expect(addrs.length).to.equal(2);

    const t1idx = addrs.indexOf(trader1.address);
    const t2idx = addrs.indexOf(trader2.address);

    expect(pnls[t1idx]).to.be.gt(0n); // trader1 profitable
    expect(pnls[t2idx]).to.be.lt(0n); // trader2 lost
  });
});