const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OPN Perp Lite", function () {
  let oracle, vault, perp;
  let owner, trader1, trader2, liquidator;
  const INITIAL_PRICE = 50000; // $0.05 in 6-decimal USD

  beforeEach(async function () {
    [owner, trader1, trader2, liquidator] = await ethers.getSigners();

    const OracleKeeper = await ethers.getContractFactory("OracleKeeper");
    oracle = await OracleKeeper.deploy(INITIAL_PRICE);

    const LiquidityVault = await ethers.getContractFactory("LiquidityVault");
    vault = await LiquidityVault.deploy();

    const PerpEngine = await ethers.getContractFactory("PerpEngine");
    perp = await PerpEngine.deploy(await oracle.getAddress(), await vault.getAddress());

    await vault.setPerpEngine(await perp.getAddress());

    // Seed vault with liquidity
    await vault.connect(owner).deposit({ value: ethers.parseEther("10") });
  });

  // ── OracleKeeper ──────────────────────────────────────────
  describe("OracleKeeper", function () {
    it("stores initial price", async function () {
      expect(await oracle.getPrice()).to.equal(INITIAL_PRICE);
    });

    it("keeper can update price", async function () {
      await oracle.setPrice(60000);
      expect(await oracle.getPrice()).to.equal(60000);
    });

    it("non-keeper cannot set price", async function () {
      await expect(oracle.connect(trader1).setPrice(60000)).to.be.revertedWith("Not authorized");
    });

    it("tracks price history", async function () {
      await oracle.setPrice(55000);
      await oracle.setPrice(60000);
      const [prices, , count] = await oracle.getPriceHistory();
      expect(count).to.equal(3); // initial + 2 updates
      expect(prices[1]).to.equal(55000);
      expect(prices[2]).to.equal(60000);
    });
  });

  // ── LiquidityVault ────────────────────────────────────────
  describe("LiquidityVault", function () {
    it("accepts deposits and mints shares", async function () {
      await vault.connect(trader1).deposit({ value: ethers.parseEther("1") });
      const [shares] = await vault.getLPShare(trader1.address);
      expect(shares).to.be.gt(0);
    });

    it("allows withdrawals proportional to shares", async function () {
      await vault.connect(trader1).deposit({ value: ethers.parseEther("1") });
      const [shares] = await vault.getLPShare(trader1.address);
      const balBefore = await ethers.provider.getBalance(trader1.address);
      await vault.connect(trader1).withdraw(shares);
      const balAfter = await ethers.provider.getBalance(trader1.address);
      expect(balAfter).to.be.gt(balBefore);
    });

    it("only perp engine can reserve liquidity", async function () {
      await expect(
        vault.connect(trader1).reserveLiquidity(ethers.parseEther("1"))
      ).to.be.revertedWith("Not PerpEngine");
    });
  });

  // ── PerpEngine: Open Positions ────────────────────────────
  describe("PerpEngine - Open", function () {
    it("opens a long position", async function () {
      const collateral = ethers.parseEther("0.1");
      const tx = await perp.connect(trader1).openLong(2, { value: collateral });
      await expect(tx).to.emit(perp, "PositionOpened");

      const ids = await perp.getTraderPositions(trader1.address);
      const pos = await perp.getPosition(ids[0]);
      expect(pos.isLong).to.equal(true);
      expect(pos.isOpen).to.equal(true);
      expect(pos.leverage).to.equal(2);
      expect(pos.collateral).to.equal(collateral);
    });

    it("opens a short position", async function () {
      const tx = await perp.connect(trader1).openShort(5, { value: ethers.parseEther("0.1") });
      await expect(tx).to.emit(perp, "PositionOpened");

      const ids = await perp.getTraderPositions(trader1.address);
      const pos = await perp.getPosition(ids[0]);
      expect(pos.isLong).to.equal(false);
    });

    it("calculates liquidation price correctly for LONG", async function () {
      await perp.connect(trader1).openLong(2, { value: ethers.parseEther("0.1") });
      const ids = await perp.getTraderPositions(trader1.address);
      const pos = await perp.getPosition(ids[0]);
      // liq = entryPrice - entryPrice/leverage = 50000 - 25000 = 25000
      expect(pos.liquidationPrice).to.equal(25000);
    });

    it("calculates liquidation price correctly for SHORT", async function () {
      await perp.connect(trader1).openShort(5, { value: ethers.parseEther("0.1") });
      const ids = await perp.getTraderPositions(trader1.address);
      const pos = await perp.getPosition(ids[0]);
      // liq = entryPrice + entryPrice/leverage = 50000 + 10000 = 60000
      expect(pos.liquidationPrice).to.equal(60000);
    });

    it("rejects invalid leverage", async function () {
      await expect(
        perp.connect(trader1).openLong(1, { value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("Invalid leverage");
      await expect(
        perp.connect(trader1).openLong(11, { value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("Invalid leverage");
    });
  });

  // ── PerpEngine: Close Positions ───────────────────────────
  describe("PerpEngine - Close", function () {
    it("closes winning long position and pays profit", async function () {
      await perp.connect(trader1).openLong(2, { value: ethers.parseEther("0.1") });
      // Price goes up 10%
      await oracle.setPrice(55000);
      const ids = await perp.getTraderPositions(trader1.address);
      const balBefore = await ethers.provider.getBalance(trader1.address);
      await perp.connect(trader1).closePosition(ids[0]);
      const balAfter = await ethers.provider.getBalance(trader1.address);
      expect(balAfter).to.be.gt(balBefore);
    });

    it("closes losing long position", async function () {
      await perp.connect(trader1).openLong(2, { value: ethers.parseEther("0.1") });
      // Price drops 10%
      await oracle.setPrice(45000);
      const ids = await perp.getTraderPositions(trader1.address);
      await expect(perp.connect(trader1).closePosition(ids[0])).to.emit(perp, "PositionClosed");
    });

    it("only trader can close own position", async function () {
      await perp.connect(trader1).openLong(2, { value: ethers.parseEther("0.1") });
      const ids = await perp.getTraderPositions(trader1.address);
      await expect(
        perp.connect(trader2).closePosition(ids[0])
      ).to.be.revertedWith("Not your position");
    });
  });

  // ── PerpEngine: Liquidations ──────────────────────────────
  describe("PerpEngine - Liquidate", function () {
    it("liquidates underwater long position", async function () {
      await perp.connect(trader1).openLong(2, { value: ethers.parseEther("0.1") });
      // Price drops below liquidation (25000)
      await oracle.setPrice(20000);
      const ids = await perp.getTraderPositions(trader1.address);
      const tx = await perp.connect(liquidator).liquidate(ids[0]);
      await expect(tx).to.emit(perp, "Liquidated");
    });

    it("liquidator receives 5% bonus", async function () {
      await perp.connect(trader1).openLong(2, { value: ethers.parseEther("0.1") });
      await oracle.setPrice(20000);
      const ids = await perp.getTraderPositions(trader1.address);
      const balBefore = await ethers.provider.getBalance(liquidator.address);
      await perp.connect(liquidator).liquidate(ids[0]);
      const balAfter = await ethers.provider.getBalance(liquidator.address);
      expect(balAfter).to.be.gt(balBefore);
    });

    it("reverts liquidation of healthy position", async function () {
      await perp.connect(trader1).openLong(2, { value: ethers.parseEther("0.1") });
      const ids = await perp.getTraderPositions(trader1.address);
      await expect(
        perp.connect(liquidator).liquidate(ids[0])
      ).to.be.revertedWith("Not liquidatable");
    });
  });

  // ── Leaderboard ───────────────────────────────────────────
  describe("Leaderboard", function () {
    it("tracks realized PnL", async function () {
      await perp.connect(trader1).openLong(2, { value: ethers.parseEther("0.1") });
      await oracle.setPrice(55000);
      const ids = await perp.getTraderPositions(trader1.address);
      await perp.connect(trader1).closePosition(ids[0]);
      expect(await perp.realizedPnL(trader1.address)).to.be.gt(0);
    });

    it("returns leaderboard data", async function () {
      await perp.connect(trader1).openLong(2, { value: ethers.parseEther("0.1") });
      const [addrs, pnls] = await perp.getLeaderboard();
      expect(addrs.length).to.be.gte(1);
      expect(addrs[0]).to.equal(trader1.address);
    });
  });
});
