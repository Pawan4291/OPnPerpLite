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
          <div className="vault-stat-label">Total TVL</div>
          <div className="vault-stat-val">{parseFloat(vaultData.total).toFixed(4)} OPN</div>
        </div>
        <div className="vault-stat-card">
          <div className="vault-stat-label">Reserved</div>
          <div className="vault-stat-val">{parseFloat(vaultData.reserved).toFixed(4)} OPN</div>
        </div>
        <div className="vault-stat-card">
          <div className="vault-stat-label">Available</div>
          <div className="vault-stat-val highlight">{parseFloat(vaultData.available).toFixed(4)} OPN</div>
        </div>
        <div className="vault-stat-card">
          <div className="vault-stat-label">Utilization</div>
          <div className="vault-stat-val">{utilizationPct}%</div>
          <div className="util-bar-bg">
            <div className="util-bar-fill" style={{ width: `${utilizationPct}%` }} />
          </div>
        </div>
      </div>

      {/* Your Position */}
      <div className="lp-card">
        <div className="lp-card-title">Your LP Position</div>
        <div className="lp-stats">
          <div>
            <div className="lp-stat-label">Your Shares</div>
            <div className="lp-stat-val">{parseFloat(lpData.shares).toFixed(6)}</div>
          </div>
          <div>
            <div className="lp-stat-label">Your Value</div>
            <div className="lp-stat-val highlight">{parseFloat(lpData.value).toFixed(6)} OPN</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="lp-actions">
        <div className="lp-action-card">
          <div className="lp-action-title">Deposit OPN</div>
          <div className="input-wrap">
            <input
              className="collateral-input"
              type="number"
              placeholder="0.0"
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)}
              min="0.001"
              step="0.001"
            />
            <span className="input-suffix">OPN</span>
          </div>
          <div className="lp-info">Earn trading fees from losing positions</div>
          <button
            className="open-btn long"
            onClick={deposit}
            disabled={action === "deposit"}
          >
            {action === "deposit" ? "Depositing..." : "Deposit"}
          </button>
        </div>

        <div className="lp-action-card">
          <div className="lp-action-title">Withdraw</div>
          <div className="input-wrap">
            <input
              className="collateral-input"
              type="number"
              placeholder="0.0"
              value={withdrawShares}
              onChange={e => setWithdrawShares(e.target.value)}
              min="0"
              step="0.0001"
            />
            <span className="input-suffix">Shares</span>
          </div>
          <div className="lp-info">Your shares: {parseFloat(lpData.shares).toFixed(6)}</div>
          <button
            className="open-btn short"
            onClick={withdraw}
            disabled={action === "withdraw"}
          >
            {action === "withdraw" ? "Withdrawing..." : "Withdraw"}
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {txHash && (
        <div className="tx-box">
          ✓ Tx: <a href={`https://explorer.testnet.iopn.tech/tx/${txHash}`} target="_blank" rel="noreferrer">
            {txHash.slice(0, 10)}...
          </a>
        </div>
      )}
    </div>
  );
}
