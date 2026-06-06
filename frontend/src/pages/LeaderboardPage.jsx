import { useState, useEffect } from "react";
import { ethers } from "ethers";

export default function LeaderboardPage({ contracts, address }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLeaderboard = async () => {
    if (!contracts?.perp) return;
    setLoading(true);
    try {
      const [addrs, pnls] = await contracts.perp.getLeaderboard();
      const data = addrs.map((addr, i) => ({
        address: addr,
        pnl: pnls[i]
      }));
      // Sort by PnL descending
      data.sort((a, b) => (b.pnl > a.pnl ? 1 : b.pnl < a.pnl ? -1 : 0));
      setLeaderboard(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 20000);
    return () => clearInterval(interval);
  }, [contracts]);

  const formatPnL = (pnlBig) => {
    try {
      const isNeg = pnlBig < 0n;
      const abs = isNeg ? -pnlBig : pnlBig;
      const val = parseFloat(ethers.formatEther(abs));
      return {
        text: `${isNeg ? "-" : "+"}${val.toFixed(6)} OPN`,
        positive: !isNeg
      };
    } catch {
      return { text: "—", positive: true };
    }
  };

  const shortAddr = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const MEDALS = ["🥇", "🥈", "🥉"];

  return (
    <div className="leaderboard-page">
      <div className="page-header">
        <h2>Leaderboard</h2>
        <button className="refresh-btn" onClick={fetchLeaderboard}>↻ Refresh</button>
      </div>
      <div className="leaderboard-subtitle">Ranked by realized PnL · All-time · On-chain</div>

      {loading && leaderboard.length === 0 ? (
        <div className="loading-state">Loading leaderboard...</div>
      ) : leaderboard.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏆</div>
          <div>No traders yet. Be the first!</div>
        </div>
      ) : (
        <div className="leaderboard-table">
          <div className="lb-header-row">
            <span>Rank</span>
            <span>Trader</span>
            <span>Realized PnL</span>
          </div>
          {leaderboard.map((entry, i) => {
            const pnlData = formatPnL(entry.pnl);
            const isMe = address && entry.address.toLowerCase() === address.toLowerCase();
            return (
              <div key={entry.address} className={`lb-row ${isMe ? "mine" : ""}`}>
                <span className="lb-rank">
                  {i < 3 ? MEDALS[i] : `#${i + 1}`}
                </span>
                <span className="lb-addr">
                  {shortAddr(entry.address)}
                  {isMe && <span className="lb-you"> YOU</span>}
                </span>
                <span className={`lb-pnl ${pnlData.positive ? "positive" : "negative"}`}>
                  {pnlData.text}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
