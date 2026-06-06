import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";

// ── Read-only provider — NO wallet needed ─────────────────────────────────────
// This lets the price show even before the user connects MetaMask
const RPC_URL        = import.meta.env.VITE_RPC_URL        || "https://rpc.iopn.tech";
const ORACLE_ADDRESS = import.meta.env.VITE_ORACLE_ADDRESS || "0x688428b07983c792AF70994Fd4C11Cd0eB33E76D";

const ORACLE_ABI = [
  "function getPrice() external view returns (uint256)",
  "function lastUpdated() external view returns (uint256)",
  "function isPriceStale() external view returns (bool)",
  "function getPriceHistory() external view returns (uint256[] memory prices, uint256[] memory timestamps, uint256 count)",
];

// Singleton read-only provider — created once, reused forever
let readProvider = null;
let readOracle   = null;

function getReadOracle() {
  if (!readOracle) {
    readProvider = new ethers.JsonRpcProvider(RPC_URL);
    readOracle   = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, readProvider);
  }
  return readOracle;
}

export function useOracle(contracts) {
  const [price, setPrice]             = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isStale, setIsStale]         = useState(false);
  const retryRef = useRef(null);

  const fetchPrice = async () => {
    // Prefer the connected wallet's contract, fall back to read-only
    const oracle = contracts?.oracle || getReadOracle();

    try {
      const p  = await oracle.getPrice();
      const lu = await oracle.lastUpdated();

      const priceNum = Number(p);
      if (priceNum === 0) {
        console.warn("[Oracle] Price is 0 — keeper may not have pushed yet");
        return;
      }

      setPrice(priceNum);
      setLastUpdated(Number(lu));

      // isPriceStale is optional — skip if not in ABI
      try {
        const stale = await oracle.isPriceStale();
        setIsStale(stale);
      } catch (_) {}

      // Price history
      try {
        const [prices, timestamps, count] = await oracle.getPriceHistory();
        const n = Number(count);
        const history = [];

        for (let i = 0; i < n; i++) {
          const pVal = Number(prices[i]);
          const tVal = Number(timestamps[i]);
          if (pVal > 0 && tVal > 0) {
            history.push({
              price:     pVal / 1_000_000,
              timestamp: tVal * 1000,
            });
          }
        }

        if (history.length > 0) {
          setPriceHistory(history);
          console.log(`[Oracle] ${history.length} price points | latest: $${history[history.length-1].price}`);
        }
      } catch (histErr) {
        console.warn("[Oracle] History fetch failed:", histErr.message);
      }

    } catch (err) {
      console.error("[Oracle] fetch error:", err.message);
    }
  };

  useEffect(() => {
    // Fetch immediately
    fetchPrice();

    // Poll every 10s
    const interval = setInterval(fetchPrice, 10_000);

    return () => {
      clearInterval(interval);
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  // Re-run when contracts become available (wallet connects)
  }, [contracts?.oracle]);

  const priceUSD = price ? (price / 1_000_000).toFixed(6) : null;

  return { price, priceUSD, priceHistory, lastUpdated, isStale, refetch: fetchPrice };
}