require("dotenv").config();
const { ethers } = require("ethers");

// ── Config ─────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || "https://testnet-rpc.iopn.tech";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS;
const PERP_ADDRESS = process.env.PERP_ADDRESS;
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL || "30000"); // 30s

if (!PRIVATE_KEY || !ORACLE_ADDRESS || !PERP_ADDRESS) {
  console.error("Missing env vars: PRIVATE_KEY, ORACLE_ADDRESS, PERP_ADDRESS");
  process.exit(1);
}

// ── ABIs ───────────────────────────────────────────────────
const ORACLE_ABI = [
  "function setPrice(uint256 _price) external",
  "function getPrice() external view returns (uint256)",
  "event PriceUpdated(uint256 price, uint256 timestamp)"
];

const PERP_ABI = [
  "function isLiquidatable(uint256 positionId) external view returns (bool)",
  "function liquidate(uint256 positionId) external",
  "function nextPositionId() external view returns (uint256)",
  "event PositionOpened(uint256 indexed positionId, address indexed trader, bool isLong, uint256 collateral, uint8 leverage, uint256 entryPrice, uint256 liquidationPrice, uint256 positionSize)"
];

// ── Setup ──────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, wallet);
const perp = new ethers.Contract(PERP_ADDRESS, PERP_ABI, wallet);

let openPositionIds = new Set();

// Track open positions from events
async function syncOpenPositions() {
  const filter = perp.filters.PositionOpened();
  const latestBlock = await provider.getBlockNumber();

const fromBlock = Math.max(0, latestBlock - 5000);

const events = await perp.queryFilter(
  filter,
  fromBlock,
  latestBlock
);
  for (const e of events) {
    openPositionIds.add(Number(e.args.positionId));
  }
  console.log(`[Sync] Tracking ${openPositionIds.size} open positions`);
}

// ── Fetch OPN price from CoinGecko ─────────────────────────
async function fetchOPNPrice() {
  try {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=opn&vs_currencies=usd";
    const res = await fetch(url);
    const data = await res.json();
    const basePrice = data?.opn?.usd || 0.05;
    
    // Add ±1.5% realistic market noise to real price
    const noise = (Math.random() - 0.5) * 0.03;
    const finalPrice = basePrice * (1 + noise);
    return Math.round(finalPrice * 1_000_000);
  } catch (err) {
    const last = await oracle.getPrice().catch(() => 50000);
    const lastNum = Number(last);
    const changePct = (Math.random() - 0.5) * 0.04;
    const noise = Math.floor(lastNum * changePct);
    return Math.max(1000, lastNum + noise);
  }
}

// ── Update oracle price ─────────────────────────────────────
async function updatePrice() {
  try {
    const price = await fetchOPNPrice();
    const tx = await oracle.setPrice(price, { gasLimit: 100000 });
    await tx.wait();
    console.log(`[Oracle] Price updated: $${(price / 1_000_000).toFixed(6)} (${price}) | tx: ${tx.hash}`);
    return price;
  } catch (err) {
    console.error("[Oracle] Update failed:", err.message);
    return null;
  }
}

// ── Check and liquidate underwater positions ────────────────
async function checkLiquidations() {
  const toRemove = [];
  for (const posId of openPositionIds) {
    try {
      const canLiquidate = await perp.isLiquidatable(posId);
      if (canLiquidate) {
        console.log(`[Liquidator] Position ${posId} is liquidatable! Executing...`);
        const tx = await perp.liquidate(posId, { gasLimit: 200000 });
        await tx.wait();
        console.log(`[Liquidator] Position ${posId} liquidated! tx: ${tx.hash}`);
        toRemove.push(posId);
      }
    } catch (err) {
      if (err.message.includes("Position not open")) {
        toRemove.push(posId);
      }
    }
  }
  toRemove.forEach(id => openPositionIds.delete(id));
}

// ── Listen for new positions ────────────────────────────────
function startEventListener() {
  perp.on("PositionOpened", (positionId) => {
    openPositionIds.add(Number(positionId));
    console.log(`[Events] New position opened: #${positionId}`);
  });
  console.log("[Events] Listening for new positions...");
}

// ── Main loop ──────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════");
  console.log("   OPN Perp Lite — Keeper Bot");
  console.log("═══════════════════════════════════════");
  console.log("Keeper address:", wallet.address);
  console.log("Oracle:", ORACLE_ADDRESS);
  console.log("PerpEngine:", PERP_ADDRESS);
  console.log("Update interval:", UPDATE_INTERVAL / 1000, "seconds");
  console.log("───────────────────────────────────────\n");

// Sync existing positions from chain
  await syncOpenPositions();
  
  // Event filters not supported on OPN testnet — syncOpenPositions handles tracking
  // startEventListener();

  // Initial price update
  await updatePrice();

  // Recurring loop — price + liquidations
  setInterval(async () => {
    await updatePrice();
    await checkLiquidations();
  }, UPDATE_INTERVAL);
}

main().catch(console.error);
