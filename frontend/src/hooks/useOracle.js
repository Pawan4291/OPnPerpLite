import { useState, useEffect } from "react";
import { ethers } from "ethers";

const RPC_URL        = import.meta.env.VITE_RPC_URL        || "https://testnet-rpc.iopn.tech";
const ORACLE_ADDRESS = import.meta.env.VITE_ORACLE_ADDRESS || "0x688428b07903c792AF70994Fd4C11Cd0eB33E76D";

// Raw JSON-RPC call — no ethers provider, no ENS lookup
async function rpcCall(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

// eth_call helper — call a contract function
async function callContract(address, sig, outputTypes) {
  const iface     = new ethers.Interface([`function ${sig}`]);
  const fnName    = sig.split("(")[0];
  const calldata  = iface.encodeFunctionData(fnName, []);
  const result    = await rpcCall("eth_call", [{ to: address, data: calldata }, "latest"]);
  return iface.decodeFunctionResult(fnName, result);
}

export function useOracle(contracts) {
  const [price, setPrice]               = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [lastUpdated, setLastUpdated]   = useState(null);
  const [isStale, setIsStale]           = useState(false);

  const fetchPrice = async () => {
    try {
      // getPrice()
      const [priceRaw] = await callContract(
        ORACLE_ADDRESS,
        "getPrice() returns (uint256)",
        ["uint256"]
      );
      const priceNum = Number(priceRaw);
      if (priceNum === 0) { console.warn("[Oracle] Price is 0"); return; }
      setPrice(priceNum);
      console.log("[Oracle] Price:", priceNum / 1_000_000);

      // lastUpdated()
      try {
        const [lu] = await callContract(
          ORACLE_ADDRESS,
          "lastUpdated() returns (uint256)",
          ["uint256"]
        );
        const luNum = Number(lu);
        setLastUpdated(luNum);
        setIsStale(Date.now() / 1000 - luNum > 300);
      } catch (_) {}

      // getPriceHistory()
      try {
        const [prices, timestamps, count] = await callContract(
          ORACLE_ADDRESS,
          "getPriceHistory() returns (uint256[50],uint256[50],uint256)",
          ["uint256[]", "uint256[]", "uint256"]
        );
        const n = Number(count);
        const history = [];
        for (let i = 0; i < n; i++) {
          const p = Number(prices[i]);
          const t = Number(timestamps[i]);
          if (p > 0 && t > 0) history.push({ price: p / 1_000_000, timestamp: t * 1000 });
        }
        if (history.length > 0) {
          setPriceHistory(history);
          console.log(`[Oracle] ${history.length} points | latest: $${history[history.length-1].price}`);
        }
      } catch (e) {
        console.warn("[Oracle] History:", e.message);
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