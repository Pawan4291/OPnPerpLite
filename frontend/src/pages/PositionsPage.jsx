import { useState, useEffect } from "react";
import { ethers } from "ethers";

export default function PositionsPage({ contracts, address, price, priceUSD, isConnected }) {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [closingId, setClosingId] = useState(null);
  const [error, setError] = useState(null);

  const fetchPositions = async () => {
    if (!contracts?.perp || !address) return;
    setLoading(true);
    try {
      const ids = await contracts.perp.getTraderPositions(address);
      const posData = await Promise.all(
        ids.map(async (id) => {
          const pos = await contracts.perp.getPosition(id);
          const health = await contracts.perp.getHealthFactor(id);
          const pnl = await contracts.perp.getOpenPositionPnL(id);
          return {
            id: Number(id),
            trader: pos.trader,
            collateral: ethers.formatEther(pos.collateral),
            leverage: Number(pos.leverage),
            positionSize: ethers.formatEther(pos.positionSize),
            entryPrice: Number(pos.entryPrice),
            liquidationPrice: Number(pos.liquidationPrice),
            isLong: pos.isLong,
            isOpen: pos.isOpen,
            openedAt: Number(pos.openedAt),
            healthFactor: Number(health),
            pnl: pnl  // raw bigint, could be negative
          };
        })
      );
      setPositions(posData.filter(p => p.isOpen));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 15000);
    return () => clearInterval(interval);
  }, [contracts, address]);

  const closePosition = async (posId) => {
    if (!contracts?.perp) return;
    setClosingId(posId);
    setError(null);
    try {
      const tx = await contracts.perp.closePosition(posId);
      await tx.wait();
      await fetchPositions();
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setClosingId(null);
    }
  };

  const formatPnL = (pnlBig) => {
    try {
      const val = parseFloat(ethers.formatEther(pnlBig < 0n ? -pnlBig : pnlBig));
      const sign = pnlBig < 0n ? "-" : "+";
      return { text: `${sign}${val.toFixed(6)} OPN`, positive: pnlBig >= 0n };
    } catch {
      return { text: "—", positive: true };
    }
  };

  const formatPrice = (rawPrice) => `$${(rawPrice / 1_000_000).toFixed(6)}`;

  if (!isConnected) {
    return (
      <div className="page-center">
        <div className="empty-state">
          <div className="empty-icon">⟁</div>
          <div>Connect your wallet to view positions</div>
        </div>
      </div>
    );
  }

  return (
    <div className="positions-page">
      <div className="page-header">
        <h2>Your Positions</h2>
        <button className="refresh-btn" onClick={fetchPositions}>↻ Refresh</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading && positions.length === 0 ? (
        <div className="loading-state">Loading positions...</div>
      ) : positions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">◎</div>
          <div>No open positions</div>
          <div className="empty-sub">Open a position from the Trade tab</div>
        </div>
      ) : (
        <div className="positions-grid">
          {positions.map(pos => {
            const pnlData = formatPnL(pos.pnl);
            const health = pos.healthFactor;
            const healthColor = health > 60 ? "#00ff88" : health > 30 ? "#ffaa00" : "#ff3366";

            return (
              <div key={pos.id} className={`position-card ${pos.isLong ? "long" : "short"}`}>
                <div className="pos-header">
                  <div className="pos-badge">
                    <span className={`pos-dir ${pos.isLong ? "long" : "short"}`}>
                      {pos.isLong ? "▲ LONG" : "▼ SHORT"}
                    </span>
                    <span className="pos-lev">{pos.leverage}×</span>
                  </div>
                  <span className="pos-id">#{pos.id}</span>
                </div>

                <div className="pos-stats">
                  <div className="pos-stat">
                    <span className="stat-label">Collateral</span>
                    <span className="stat-val">{parseFloat(pos.collateral).toFixed(6)} OPN</span>
                  </div>
                  <div className="pos-stat">
                    <span className="stat-label">Size</span>
                    <span className="stat-val">{parseFloat(pos.positionSize).toFixed(4)} OPN</span>
                  </div>
                  <div className="pos-stat">
                    <span className="stat-label">Entry Price</span>
                    <span className="stat-val">{formatPrice(pos.entryPrice)}</span>
                  </div>
                  <div className="pos-stat">
                    <span className="stat-label">Current Price</span>
                    <span className="stat-val">${priceUSD || "—"}</span>
                  </div>
                  <div className="pos-stat">
                    <span className="stat-label">Liq. Price</span>
                    <span className="stat-val liq">{formatPrice(pos.liquidationPrice)}</span>
                  </div>
                  <div className="pos-stat">
                    <span className="stat-label">PnL</span>
                    <span className={`stat-val pnl ${pnlData.positive ? "positive" : "negative"}`}>
                      {pnlData.text}
                    </span>
                  </div>
                </div>

                {/* Health Bar */}
                <div className="health-bar-wrap">
                  <div className="health-label">
                    <span>Health</span>
                    <span style={{ color: healthColor }}>{health}%</span>
                  </div>
                  <div className="health-bar-bg">
                    <div
                      className="health-bar-fill"
                      style={{ width: `${health}%`, background: healthColor }}
                    />
                  </div>
                </div>

                <button
                  className="close-pos-btn"
                  onClick={() => closePosition(pos.id)}
                  disabled={closingId === pos.id}
                >
                  {closingId === pos.id ? "Closing..." : "Close Position"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
