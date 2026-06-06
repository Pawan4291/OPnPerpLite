import { useState, useEffect } from "react";

export function useOracle(contracts) {
  const [price, setPrice] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isStale, setIsStale] = useState(false);

  const fetchPrice = async () => {
    if (!contracts?.oracle) return;
    try {
      const p = await contracts.oracle.getPrice();
      setPrice(Number(p));

      const lu = await contracts.oracle.lastUpdated();
      setLastUpdated(Number(lu));

      const stale = await contracts.oracle.isPriceStale();
      setIsStale(stale);

      const [prices, timestamps, count] = await contracts.oracle.getPriceHistory();
const n = Number(count);

const history = [];
for (let i = 0; i < n; i++) {
  const p = Number(prices[i]);
  const t = Number(timestamps[i]);
  if (p > 0 && t > 0) {
    history.push({
      price: p / 1_000_000,
      timestamp: t * 1000
    });
  }
}

console.log("Points:", history.length);
console.log("Raw prices:", history.map(d => d.price));
console.log("Range check - First:", history[0]?.price, "Last:", history[history.length-1]?.price);
setPriceHistory(history);
    } catch (err) {
      console.error("Oracle fetch error:", err);
    }
  };

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [contracts]);

  // Price in USD (stored as 6-decimal int)
  const priceUSD = price ? (price / 1_000_000).toFixed(6) : null;

  return { price, priceUSD, priceHistory, lastUpdated, isStale, refetch: fetchPrice };
}
