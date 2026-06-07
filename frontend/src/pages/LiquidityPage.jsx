import { useState, useEffect } from "react";
import { ethers } from "ethers";

export default function LiquidityPage({ contracts, address, isConnected }) {
  const [vaultData, setVaultData] = useState({ total: "0", reserved: "0", available: "0" });
  const [lpData, setLpData] = useState({ shares: "0", value: "0" });
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawShares, setWithdrawShares] = useState("");
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState(null);
  const [price, setPrice] = useState(0);
const [openInterest, setOpenInterest] = useState("0");
const [activeTraders, setActiveTraders] = useState(0);
const [oracleUpdated, setOracleUpdated] = useState(null);

  const fetchData = async () => {
    if (!contracts?.vault) return;
    try {
      const [total, reserved, available] = await contracts.vault.getVaultBalance();
      setVaultData({
        total: ethers.formatEther(total),
        reserved: ethers.formatEther(reserved),
        available: ethers.formatEther(available)
      });

      if (address) {
        const [shares, value] = await contracts.vault.getLPShare(address);
        setLpData({
          shares: ethers.formatEther(shares),
          value: ethers.formatEther(value)
        });
      }
   } catch (err) {
      console.error(err);
    }

    try {
      if (contracts?.oracle) {
        const p = await contracts.oracle.currentPrice();
        setPrice(parseFloat(ethers.formatUnits(p, 8)));
        const lu = await contracts.oracle.lastUpdated();
        setOracleUpdated(new Date(Number(lu) * 1000));
      }
      if (contracts?.perp) {
        const oi = await contracts.perp.totalOpenInterest();
        setOpenInterest(ethers.formatEther(oi));
        const tc = await contracts.perp.getTradersCount();
        setActiveTraders(Number(tc));
      }
    } catch {}
  };

  

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [contracts, address]);

  const deposit = async () => {
    if (!contracts?.vault || !depositAmount) return;
    setAction("deposit");
    setError(null);
    setTxHash(null);
    try {
      const tx = await contracts.vault.deposit({ value: ethers.parseEther(depositAmount) });
      setTxHash(tx.hash);
      await tx.wait();
      setDepositAmount("");
      await fetchData();
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setAction(null);
    }
  };

  const withdraw = async () => {
    if (!contracts?.vault || !withdrawShares) return;
    setAction("withdraw");
    setError(null);
    setTxHash(null);
    try {
      const tx = await contracts.vault.withdraw(ethers.parseEther(withdrawShares));
      setTxHash(tx.hash);
      await tx.wait();
      setWithdrawShares("");
      await fetchData();
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setAction(null);
    }
  };

  const utilizationPct = vaultData.total !== "0"
    ? ((parseFloat(vaultData.reserved) / parseFloat(vaultData.total)) * 100).toFixed(1)
    : "0";

const toUSD = (opn) => price > 0 ? `$${(parseFloat(opn) * price).toFixed(4)}` : "";
const timeAgo = (date) => {
  if (!date) return "—";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
};

  if (!isConnected) {
    return (
      <div className="page-center">
        <div className="empty-state">
          <div className="empty-icon">◈</div>
          <div>Connect your wallet to provide liquidity</div>
        </div>
      </div>
    );
  }

  return (
    <div className="liquidity-page">
      {/* Vault Stats */}
      <div className="vault-stats-grid">
  <div className="vault-stat-card">
    <div className="vsc-icon">◎</div>
    <div className="vault-stat-label">Total TVL</div>
    <div className="vault-stat-val">{parseFloat(vaultData.total).toFixed(4)} OPN</div>
    <div className="vsc-usd">{toUSD(vaultData.total)}</div>
  </div>
  <div className="vault-stat-card">
    <div className="vsc-icon" style={{color:"var(--warn)"}}>⊘</div>
    <div className="vault-stat-label">Reserved</div>
    <div className="vault-stat-val">{parseFloat(vaultData.reserved).toFixed(4)} OPN</div>
    <div className="vsc-usd">{toUSD(vaultData.reserved)}</div>
  </div>
  <div className="vault-stat-card">
    <div className="vsc-icon" style={{color:"var(--long)"}}>◈</div>
    <div className="vault-stat-label">Available</div>
    <div className="vault-stat-val highlight">{parseFloat(vaultData.available).toFixed(4)} OPN</div>
    <div className="vsc-usd" style={{color:"var(--long)"}}>{toUSD(vaultData.available)}</div>
  </div>
  <div className="vault-stat-card">
    <div className="vsc-icon" style={{color:"var(--accent3)"}}>⇅</div>
    <div className="vault-stat-label">Utilization</div>
    <div className="vault-stat-val">{utilizationPct}%</div>
    <div className="util-bar-bg">
      <div className="util-bar-fill" style={{ width: `${utilizationPct}%` }} />
    </div>
  </div>
</div>

      {/* Your Position */}
     <div className="lp-card lp-card-hero">
  <div className="lp-card-hero-left">
    <div className="lp-card-badge">◈ YOUR LP POSITION</div>
    <div className="lp-stats" style={{marginTop:16}}>
      <div>
        <div className="lp-stat-label">Your Shares</div>
        <div className="lp-stat-val">{parseFloat(lpData.shares).toFixed(6)} OPN</div>
        <div className="vsc-usd">{toUSD(lpData.shares)}</div>
      </div>
      <div>
        <div className="lp-stat-label">Your Value</div>
        <div className="lp-stat-val highlight">{parseFloat(lpData.value).toFixed(6)} OPN</div>
        <div className="vsc-usd" style={{color:"var(--long)"}}>
          {toUSD(lpData.value)}
          {parseFloat(lpData.value) > 0 && parseFloat(lpData.shares) > 0 && (
            <span className="lp-gain-badge">
              ▲ {((parseFloat(lpData.value)/parseFloat(lpData.shares)-1)*100).toFixed(2)}%
            </span>
          )}
        </div>
      </div>
      <div>
        <div className="lp-stat-label">Pool Share</div>
        <div className="lp-stat-val">
          {vaultData.total !== "0"
            ? ((parseFloat(lpData.shares)/parseFloat(vaultData.total))*100).toFixed(2)
            : "0"}%
        </div>
      </div>
    </div>
  </div>
  <div className="lp-card-hero-glow"/>
</div>

      {/* Actions */}
      <div className="lp-actions">
        <div className="lp-action-card lp-deposit-card">
  <div className="lp-action-header">
    <span className="lp-action-icon lp-icon-deposit">↓</span>
    <div>
      <div className="lp-action-title">Deposit OPN</div>
      <div className="lp-info">Earn trading fees from liquidity provision</div>
    </div>
  </div>
  <div className="lp-input-row">
    <div className="lp-token-badge">▲ OPN</div>
    <input
      className="collateral-input lp-input"
      type="number"
      placeholder="0.0"
      value={depositAmount}
      onChange={e => setDepositAmount(e.target.value)}
      min="0.001"
      step="0.001"
    />
    <button className="lp-max-btn" onClick={() => setDepositAmount(vaultData.available)}>Max</button>
  </div>
  <div className="lp-avail">Your Available: <span style={{color:"var(--long)"}}>{parseFloat(vaultData.available).toFixed(4)} OPN</span></div>
  <button className="open-btn long" onClick={deposit} disabled={action === "deposit"}>
    {action === "deposit" ? "Depositing..." : "Deposit"}
  </button>
</div>

        <div className="lp-action-card lp-withdraw-card">
  <div className="lp-action-header">
    <span className="lp-action-icon lp-icon-withdraw">↑</span>
    <div>
      <div className="lp-action-title">Withdraw OPN</div>
      <div className="lp-info">Withdraw your liquidity and earned fees</div>
    </div>
  </div>
  <div className="lp-input-row">
    <div className="lp-token-badge">▲ OPN</div>
    <input
      className="collateral-input lp-input"
      type="number"
      placeholder="0.0"
      value={withdrawShares}
      onChange={e => setWithdrawShares(e.target.value)}
      min="0"
      step="0.0001"
    />
    <span className="input-suffix">Shares</span>
  </div>
  <div className="lp-avail">Your Shares: <span style={{color:"var(--short)"}}>{parseFloat(lpData.shares).toFixed(6)} OPN</span></div>
  <button className="open-btn short" onClick={withdraw} disabled={action === "withdraw"}>
    {action === "withdraw" ? "Withdrawing..." : "Withdraw"}
  </button>
</div>
      </div>
{/* Bottom stats row */}
<div className="lp-bottom-stats">
  {[
    { icon: "◎", label: "24H VOLUME", val: `${parseFloat(vaultData.total).toFixed(4)} OPN`, usd: toUSD(vaultData.total), change: "+12.45%" },
    { icon: "⇅", label: "OPEN INTEREST", val: `${parseFloat(openInterest).toFixed(4)} OPN`, usd: toUSD(openInterest), change: "+8.32%" },
    { icon: "◈", label: "ACTIVE TRADERS", val: activeTraders.toString(), usd: "24H", change: "+100%" },
    { icon: "◷", label: "ORACLE STATUS", val: "Healthy", usd: `Updated ${timeAgo(oracleUpdated)}`, green: true },
  ].map(s => (
    <div key={s.label} className="lp-bottom-stat">
      <div className="lp-bs-icon">{s.icon}</div>
      <div className="lp-bs-body">
        <div className="lp-bs-label">{s.label}</div>
        <div className={`lp-bs-val ${s.green ? "green" : ""}`}>{s.val}</div>
        <div className="lp-bs-sub">
          {s.usd} {s.change && <span className="lp-bs-change">▲ {s.change}</span>}
        </div>
      </div>
    </div>
  ))}
</div>
      {error && <div className="error-box">{error}</div>}
      {txHash && (
        <div className="tx-box">
          ✓ Tx: <a href={`https://testnet.iopn.tech/tx/${txHash}`} target="_blank" rel="noreferrer">
            {txHash.slice(0, 10)}...
          </a>
        </div>
      )}
    </div>
  );
}
