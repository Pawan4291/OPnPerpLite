import { useState, useEffect } from "react";
import { ethers } from "ethers";

const RPC_URL        = import.meta.env.VITE_RPC_URL        || "https://testnet-rpc.iopn.tech";
const ORACLE_ADDRESS = import.meta.env.VITE_ORACLE_ADDRESS || "0x688428b07903c792AF70994Fd4C11C0eB33E76D";

const ORACLE_ABI = [
  "function getPrice() external view returns (uint256)",
  "function lastUpdated() external view returns (uint256)",
  "function getPriceHistory() external view returns (uint256[] memory prices, uint256[] memory timestamps, uint256 count)",
];

// Static network stops ethers v6 from doing ENS lookups
const OPN_NETWORK = new ethers.Network("opn-testnet", 984);

let readProvider = null;
let readOracle   = null;

function getReadOracle() {
  if (!readOracle) {
    // StaticNetwork = no ENS, no extra RPC calls
    readProvider = new ethers.JsonRpcProvider(RPC_URL, OPN_NETWORK, {
      staticNetwork: OPN_NETWORK,
    });
    readOracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, readProvider);
  }
  return readOracle;
}

export function useOracle(contracts) {
  const [price, setPrice]               = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [lastUpdated, setLastUpdated]   = useState(null);
  const [isStale, setIsStale]           = useState(false);

  const fetchPrice = async () => {
    try {
      const oracle = getReadOracle();

      const p  = await oracle.getPrice();
      const lu = await oracle.lastUpdated();

      const priceNum = Number(p);
      if (priceNum === 0) {
        console.warn("[Oracle] Price is 0");
        return;
      }

      setPrice(priceNum);
      setLastUpdated(Number(lu));

      // Check if stale (older than 5 minutes)
      const age = Date.now() / 1000 - Number(lu);
      setIsStale(age > 300);

      // Price history
      try {
        const [prices, timestamps, count] = await oracle.getPriceHistory();
        const n = Number(count);
        const history = [];
        for (let i = 0; i < n; i++) {
          const pVal = Number(prices[i]);
          const tVal = Number(timestamps[i]);
          if (pVal > 0 && tVal > 0) {
            history.push({ price: pVal / 1_000_000, timestamp: tVal * 1000 });
          }
        }
        if (history.length > 0) {
          setPriceHistory(history);
          console.log(`[Oracle] $${history[history.length - 1].price} | ${history.length} points`);
        }
      } catch (e) {
        console.warn("[Oracle] History error:", e.message);
      }

    } catch (err) {
      console.error("[Oracle] Error:", err.message);
    }
  };

  useEffect(() => {
    fetchPrice();
    const id = setInterval(fetchPrice, 10_000);
    return () => clearInterval(id);
  }, []);

  const priceUSD = price ? (price / 1_000_000).toFixed(6) : null;

  return { price, priceUSD, priceHistory, lastUpdated, isStale, refetch: fetchPrice };
}