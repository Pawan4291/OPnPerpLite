import { useState, useEffect } from "react";
import { ethers } from "ethers";

export default function LiquidityPage({ contracts, address, isConnected }) {
  const [vaultData, setVaultData]     = useState({ total: "0", reserved: "0", available: "0" });
  const [lpData, setLpData]           = useState({ shares: "0", value: "0" });
  const [walletBalance, setWalletBalance] = useState("0");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawShares, setWithdrawShares] = useState("");
  const [action, setAction]           = useState(null);
  const [txHash, setTxHash]           = useState(null);
  const [error, setError]             = useState(null);
  const [oraclePrice, setOraclePrice] = useState(0);
  const [oracleUpdated, setOracleUpdated] = useState(null);
  const [activeTraders, setActiveTraders] = useState(0);
  const [openInterest, setOpenInterest]   = useState("0");

  const fetchData = async () => {
    if (!contracts?.vault) return;

    // ── Vault data ──────────────────────────────
    try {
      const [total, reserved, available] = await contracts.vault.getVaultBalance();
      setVaultData({
        total:     ethers.formatEther(total),
        reserved:  ethers.formatEther(reserved),
        available: ethers.formatEther(available),
      });
    } catch (e) { console.error("vault:", e); }

    // ── LP share ────────────────────────────────
    try {
      if (address) {
        const [shares, value] = await contracts.vault.getLPShare(address);
        setLpData({
          shares: ethers.formatEther(shares),
          value:  ethers.formatEther(value),
        });
      }
    } catch (e) { console.error("lp:", e); }

    // ── Wallet balance ──────────────────────────
    try {
      const provider = contracts.vault.runner?.provider;
      if (provider && address) {
        const bal = await provider.getBalance(address);
        setWalletBalance(ethers.formatEther(bal));
      }
    } catch (e) { console.error("bal:", e); }

    // ── Oracle price + last updated ─────────────
    try {
      if (contracts?.oracle) {
        const p  = await contracts.oracle.getPrice();
        // price stored as 6-decimal USD integer e.g. 50000 = $0.05
        setOraclePrice(Number(p) / 1_000_000);
        const lu = await contracts.oracle.lastUpdated();
        setOracleUpdated(new Date(Number(lu) * 1000));
      }
    } catch (e) { console.error("oracle:", e); }

    // ── Active traders + open interest ──────────
    try {
      if (contracts?.perp) {
        // getLeaderboard returns [addresses[], pnls[]]
        const [addrs] = await contracts.perp.getLeaderboard();
        const traders = addrs.filter(
          a => a !== "0x0000000000000000000000000000000000000000"
        ).length;
        setActiveTraders(traders);

        // open interest = reservedLiquidity in vault
        setOpenInterest(ethers.formatEther(
          await contracts.vault.getVaultBalance().then(r => r[1])
        ));
      }
    } catch (e) { console.error("perp:", e); }
  };

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 15000);
    return () => clearInterval(t);
  }, [contracts, address]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const deposit = async () => {
    if (!contracts?.vault || !depositAmount) return;
    setAction("deposit"); setError(null); setTxHash(null);
    try {
      const tx = await contracts.vault.deposit({ value: ethers.parseEther(depositAmount) });
      setTxHash(tx.hash);
      await tx.wait();
      setDepositAmount("");
      await fetchData();
    } catch (e) { setError(e.reason || e.message); }
    finally { setAction(null); }
  };

  const withdraw = async () => {
    if (!contracts?.vault || !withdrawShares) return;
    setAction("withdraw"); setError(null); setTxHash(null);
    try {
      const tx = await contracts.vault.withdraw(ethers.parseEther(withdrawShares));
      setTxHash(tx.hash);
      await tx.wait();
      setWithdrawShares("");
      await fetchData();
    } catch (e) { setError(e.reason || e.message); }
    finally { setAction(null); }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const utilizationPct = vaultData.total !== "0"
    ? ((parseFloat(vaultData.reserved) / parseFloat(vaultData.total)) * 100).toFixed(1)
    : "0";

  const toUSD = (opn) =>
    oraclePrice > 0
      ? `≈ $${(parseFloat(opn || 0) * oraclePrice).toFixed(4)}`
      : "";

  const timeAgo = (date) => {
    if (!date) return "—";
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  const maxDeposit = () => {
    const bal = parseFloat(walletBalance);
    if (bal > 0.01) setDepositAmount((bal - 0.01).toFixed(4));
  };

  const maxWithdraw = () => setWithdrawShares(lpData.shares);

  // ── Render ───────────────────────────────────────────────────────────────
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

      {/* ── Top stats ── */}
      <div className="vault-stats-grid">
        {[
          { icon: "◎", label: "TOTAL TVL",    val: `${parseFloat(vaultData.total).toFixed(4)} OPN`,     usd: toUSD(vaultData.total) },
          { icon: "⊘", label: "RESERVED",     val: `${parseFloat(vaultData.reserved).toFixed(4)} OPN`,  usd: toUSD(vaultData.reserved), warn: true },
          { icon: "◈", label: "AVAILABLE",    val: `${parseFloat(vaultData.available).toFixed(4)} OPN`, usd: toUSD(vaultData.available), green: true },
          { icon: "⇅", label: "UTILIZATION",  val: `${utilizationPct}%`, bar: true },
        ].map(s => (
          <div key={s.label} className="vault-stat-card">
            <div className="vsc-icon" style={{ color: s.green ? "var(--long)" : s.warn ? "var(--warn)" : "var(--accent)" }}>{s.icon}</div>
            <div className="vault-stat-label">{s.label}</div>
            <div className={`vault-stat-val ${s.green ? "highlight" : ""}`}>{s.val}</div>
            {s.usd && <div className="vsc-usd">{s.usd}</div>}
            {s.bar && (
              <div className="util-bar-bg">
                <div className="util-bar-fill" style={{ width: `${utilizationPct}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Your LP position ── */}
      <div className="lp-card">
        <div className="lp-card-badge" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 10, fontWeight: 700, color: "var(--accent)",
          background: "rgba(124,140,255,0.08)", border: "1px solid rgba(124,140,255,0.2)",
          padding: "4px 12px", borderRadius: 20, marginBottom: 16,
        }}>◈ YOUR LP POSITION</div>
        <div className="lp-stats">
          <div>
            <div className="lp-stat-label">Your Shares</div>
            <div className="lp-stat-val">{parseFloat(lpData.shares).toFixed(6)} OPN</div>
          </div>
          <div>
            <div className="lp-stat-label">Your Value</div>
            <div className="lp-stat-val highlight">{parseFloat(lpData.value).toFixed(6)} OPN</div>
            <div className="vsc-usd" style={{ color: "var(--long)" }}>{toUSD(lpData.value)}</div>
          </div>
          <div>
            <div className="lp-stat-label">Pool Share</div>
            <div className="lp-stat-val">
              {vaultData.total !== "0"
                ? ((parseFloat(lpData.shares) / parseFloat(vaultData.total)) * 100).toFixed(2)
                : "0"}%
            </div>
          </div>
          <div>
            <div className="lp-stat-label">Wallet Balance</div>
            <div className="lp-stat-val">{parseFloat(walletBalance).toFixed(4)} OPN</div>
            <div className="vsc-usd">{toUSD(walletBalance)}</div>
          </div>
        </div>
      </div>

      {/* ── Deposit / Withdraw ── */}
      <div className="lp-actions">

        {/* Deposit */}
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
            <button className="lp-max-btn" onClick={maxDeposit}>Max</button>
          </div>
          <div className="lp-avail">
            Wallet: <span style={{ color: "var(--long)" }}>{parseFloat(walletBalance).toFixed(4)} OPN</span>
          </div>
          <button className="open-btn long" onClick={deposit} disabled={action === "deposit"}>
            {action === "deposit" ? "Depositing..." : "Deposit"}
          </button>
        </div>

        {/* Withdraw */}
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
            <button className="lp-max-btn" onClick={maxWithdraw}>Max</button>
          </div>
          <div className="lp-avail">
            Your Shares: <span style={{ color: "var(--short)" }}>{parseFloat(lpData.shares).toFixed(6)} OPN</span>
          </div>
          <button className="open-btn short" onClick={withdraw} disabled={action === "withdraw"}>
            {action === "withdraw" ? "Withdrawing..." : "Withdraw"}
          </button>
        </div>

      </div>

      {/* ── Bottom stats ── */}
      <div className="lp-bottom-stats">
        {[
          {
            icon: "◎",
            label: "24H VOLUME",
            val: `${parseFloat(vaultData.total).toFixed(4)} OPN`,
            sub: toUSD(vaultData.total),
            change: null,
          },
          {
            icon: "⇅",
            label: "OPEN INTEREST",
            val: `${parseFloat(openInterest).toFixed(4)} OPN`,
            sub: toUSD(openInterest),
            change: null,
          },
          {
            icon: "◈",
            label: "ACTIVE TRADERS",
            val: activeTraders.toString(),
            sub: "Unique wallets on OPN Chain",
            change: null,
          },
          {
            icon: "◷",
            label: "ORACLE STATUS",
            val: oracleUpdated ? "Healthy" : "—",
            sub: `Updated ${timeAgo(oracleUpdated)}`,
            green: true,
          },
        ].map(s => (
          <div key={s.label} className="lp-bottom-stat">
            <div className="lp-bs-icon">{s.icon}</div>
            <div>
              <div className="lp-bs-label">{s.label}</div>
              <div className={`lp-bs-val ${s.green ? "green" : ""}`}>{s.val}</div>
              <div className="lp-bs-sub">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {error   && <div className="error-box">{error}</div>}
      {txHash  && (
        <div className="tx-box">
          ✓ Tx: <a href={`https://testnet.iopn.tech/tx/${txHash}`} target="_blank" rel="noreferrer">
            {txHash.slice(0, 10)}...
          </a>
        </div>
      )}
    </div>
  );
}
