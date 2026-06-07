import { useState } from "react";
import { useWallet } from "./hooks/useWallet";
import { useContracts } from "./hooks/useContracts";
import { useOracle } from "./hooks/useOracle";
import TradePage from "./pages/TradePage";
import PositionsPage from "./pages/PositionsPage";
import LiquidityPage from "./pages/LiquidityPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import "./index.css";
import AnimatedBackground from "./components/AnimatedBackground";

const TABS = ["TRADE", "POSITIONS", "LIQUIDITY", "LEADERBOARD"];

export default function App() {
 const [tab, setTab] = useState("TRADE");
const [showApp, setShowApp] = useState(false);
  const { signer, provider, address, isConnecting, isCorrectChain, connect, switchToOPN, disconnect } = useWallet();
  const contracts = useContracts(signer, provider);
  const { price, priceUSD, priceHistory, isStale } = useOracle(contracts);

  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null;

 if (!showApp) return (
    <>
      <AnimatedBackground />
      <div className="hero">
        <div className="hero-badge">⟁ OPN Chain · Season 1 · DeFi & Open Finance</div>
        <h1 className="hero-title">The First <span className="hero-accent">Perpetuals DEX</span><br />on OPN Chain</h1>
        <p className="hero-sub">Trade OPN with up to 10× leverage. Real liquidations. Real PnL. Fully on-chain.</p>
        <div className="hero-stats">
          <div className="hero-stat"><div className="hero-stat-val">3</div><div className="hero-stat-label">Smart Contracts</div></div>
          <div className="hero-stat"><div className="hero-stat-val">10×</div><div className="hero-stat-label">Max Leverage</div></div>
          <div className="hero-stat"><div className="hero-stat-val">30s</div><div className="hero-stat-label">Oracle Updates</div></div>
          <div className="hero-stat"><div className="hero-stat-val">984</div><div className="hero-stat-label">OPN Chain ID</div></div>
        </div>
        <div className="hero-btns">
          <button className="hero-btn-primary" onClick={() => setShowApp(true)}>Launch App →</button>
          <a className="hero-btn-secondary" href="https://faucet.iopn.tech" target="_blank" rel="noreferrer">Get Testnet OPN</a>
          <a className="hero-btn-secondary" href="https://testnet.iopn.tech" target="_blank" rel="noreferrer">Explorer ↗</a>
        </div>
        <div className="hero-contracts">
          <div className="hero-contract-title">Deployed Contracts · OPN Testnet</div>
          <div className="hero-contract-row"><span>OracleKeeper</span><span>0x688428b07903c792AF70994Fd4C11Cd0eB33E76D</span></div>
          <div className="hero-contract-row"><span>LiquidityVault</span><span>0xE73b20FDD21E23EFd861baf5a5f88775E3695969</span></div>
          <div className="hero-contract-row"><span>PerpEngine</span><span>0x4a7acf3Bba2A15d5493f7C772C96d2e28b5C9836</span></div>
        </div>
      </div>
    </>
  );

  return (
  <>
    <AnimatedBackground />
    <div className="app">

      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
  <div className="logo-icon-box">⟁</div>
  <span className="logo-text">OPN <span className="logo-accent">PERP</span> <span className="logo-dim">LITE</span></span>
</div>
          <div className="price-ticker">
            {priceUSD ? (
              <>
                <span className="ticker-label">OPN/USD</span>
                <span className={`ticker-price ${isStale ? "stale" : "live"}`}>
                  ${priceUSD}
                </span>
                <span className={`ticker-dot ${isStale ? "stale" : "live"}`}>●</span>
              </>
            ) : (
              <span className="ticker-loading">Fetching price...</span>
            )}
          </div>
        </div>

        <nav className="nav">
          {TABS.map(t => (
            <button
              key={t}
              className={`nav-btn ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="header-right">
          <a href="https://faucet.iopn.tech" target="_blank" rel="noreferrer" className="faucet-btn">
  💧 Faucet
</a>
          {!address ? (
            <button className="connect-btn" onClick={connect} disabled={isConnecting}>
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          ) : !isCorrectChain ? (
            <button className="connect-btn warning" onClick={switchToOPN}>
              Switch to OPN Chain
            </button>
          ) : (
           <div className="wallet-info" style={{cursor:"pointer", position:"relative"}}
  onClick={disconnect}
  title="Click to disconnect"
>
  <span className="wallet-dot">●</span>
  <span className="wallet-addr">{shortAddr}</span>
  <span style={{fontSize:9, color:"var(--text-dim)", marginLeft:4}}>✕</span>
</div>
          )}
        </div>
      </header>

      {/* ── Chain warning ── */}
      {address && !isCorrectChain && (
        <div className="chain-warning">
          ⚠ Wrong network — please switch to OPN Testnet (Chain ID: 984)
          <button onClick={switchToOPN}>Switch Now</button>
        </div>
      )}

      {/* ── Main ── */}
      <main className="main">
        {tab === "TRADE" && (
          <TradePage
            contracts={contracts}
            address={address}
            price={price}
            priceUSD={priceUSD}
            priceHistory={priceHistory}
            isConnected={!!address && isCorrectChain}
          />
        )}
        {tab === "POSITIONS" && (
          <PositionsPage
            contracts={contracts}
            address={address}
            price={price}
            priceUSD={priceUSD}
            isConnected={!!address && isCorrectChain}
          />
        )}
        {tab === "LIQUIDITY" && (
          <LiquidityPage
            contracts={contracts}
            address={address}
            isConnected={!!address && isCorrectChain}
          />
        )}
        {tab === "LEADERBOARD" && (
          <LeaderboardPage
            contracts={contracts}
            address={address}
          />
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
  <div className="footer-left">
    <span className="footer-logo">⟁ OPN PERP LITE</span>
    <span className="footer-sep">·</span>
    <span>Built on OPN Chain</span>
    <span className="footer-sep">·</span>
    <span>Season 1 · DeFi & Open Finance</span>
  </div>
  <div className="footer-right">
    <a href="https://testnet.iopn.tech" target="_blank" rel="noreferrer">Testnet Explorer ↗</a>
    <a href="https://builders.iopn.tech" target="_blank" rel="noreferrer">Builders Dashboard ↗</a>
    <a href="https://faucet.iopn.tech" target="_blank" rel="noreferrer">Faucet ↗</a>
  </div>
</footer>

    </div>
    </>
  );
}
