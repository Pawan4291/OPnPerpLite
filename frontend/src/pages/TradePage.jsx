import { useState, useRef, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { createChart, ColorType, CrosshairMode, AreaSeries, CandlestickSeries } from "lightweight-charts";

/* ─────────────────────────────────────────────
   IOPn Brand Palette
   Primary:   #7B3FE4  (OPN violet)
   Secondary: #A259FF  (light violet)
   Accent:    #C084FC  (lavender)
   Green:     #22C55E
   Red:       #EF4444
   BG:        #0D0A1A → #130E24
   Surface:   #1A1330
   Border:    #2A1F4A
───────────────────────────────────────────── */

const COLORS = {
  bg: "#120C24",
  surface:   "#181032",
  panel:     "#211541",
  border:    "#2A1F4A",
  borderHi:  "#3D2E6A",
  violet:    "#7B3FE4",
  violetLo:  "#A259FF",
  lavender:  "#C084FC",
  muted:     "#B7A8E6",
  dimmed:    "#3D2E6A",
  text:      "#EDE9F6",
  textSub:   "#E8DFFF",
  green:     "#22C55E",
 greenLo: "rgba(34,197,94,0.25)",
  greenBd:   "rgba(34,197,94,0.25)",
  red:       "#EF4444",
 redLo: "rgba(239,68,68,0.25)",
  redBd:     "rgba(239,68,68,0.25)",
};

const TF_LIST = [];
const LEVERAGES = [2, 5, 10];

// ── Main component ──────────────────────────────────────────────────────────
export default function TradePage({ contracts, address, price, priceUSD, priceHistory = [], isConnected }) {
  const [side, setSide]           = useState("LONG");
  const [leverage, setLeverage]   = useState(2);
  const [collateral, setCollateral] = useState("");
  const [sliderPct, setSliderPct] = useState(0);
  const [orderType, setOrderType] = useState("Market");
  const [limitPrice, setLimitPrice] = useState("");
  const [tf, setTf]               = useState("1H");
  const [chartType, setChartType] = useState("Line"); // "Line" | "Candle"
  const [loading, setLoading]     = useState(false);
  const [txHash, setTxHash]       = useState(null);
  const [error, setError]         = useState(null);
  const [stats, setStats] = useState({
  volume: 0,
  openInterest: 0,
  activeTraders: 0,
});

  // derived
  const collateralNum  = parseFloat(collateral) || 0;
  const entryPrice     = orderType === "Limit" && parseFloat(limitPrice) > 0
    ? parseFloat(limitPrice)
    : (priceUSD ? parseFloat(priceUSD) : 0);
  const positionSize   = collateralNum * leverage;
  const liqPrice       = entryPrice > 0 && collateralNum > 0
    ? side === "LONG"
      ? (entryPrice * (1 - 1 / leverage)).toFixed(6)
      : (entryPrice * (1 + 1 / leverage)).toFixed(6)
    : null;

  const prices     = priceHistory.map(d => d.price);
  // Always use live oracle price as "now", not last history point
const priceNow   = priceUSD ? parseFloat(priceUSD) : (prices.length ? prices[prices.length - 1] : 0);
const priceStart = prices.length ? prices[0] : 0;
  const pctChange  = priceStart > 0 ? ((priceNow - priceStart) / priceStart * 100) : 0;
  const isUp       = pctChange >= 0;
  const high24     = prices.length ? Math.max(...prices) : 0;
  const low24      = prices.length ? Math.min(...prices) : 0;

  // slider → collateral sync
 const handleSliderClick = useCallback((e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  setSliderPct(Math.round(pct * 100));
  setCollateral((pct * 1).toFixed(4));
}, []);


useEffect(() => {
  if (!contracts?.vault || !contracts?.perp) return;
  const load = async () => {
    try {
      const [vaultData, leaderboard] = await Promise.all([
        contracts.vault.getVaultBalance(),
        contracts.perp.getLeaderboard(),
      ]);
      const total    = parseFloat(ethers.formatEther(vaultData.total));
      const reserved = parseFloat(ethers.formatEther(vaultData.reserved));
      const traders  = leaderboard[0].filter(
        addr => addr !== "0x0000000000000000000000000000000000000000"
      ).length;
      setStats({
        volume:        total,
        openInterest:  reserved,
        activeTraders: traders > 0 ? traders : (address ? 1 : 0),
      });
    } catch (err) {
      console.error("Stats error:", err);
    }
  };
  load();
  const t = setInterval(load, 30000);
  return () => clearInterval(t);
}, [contracts, address]);

  const openPosition = async () => {
    if (!isConnected || !contracts?.perp) return;
    if (!collateral || collateralNum <= 0) { setError("Enter collateral amount"); return; }
    setLoading(true); setError(null); setTxHash(null);
    try {
      const value = ethers.parseEther(collateral);
      const tx = side === "LONG"
        ? await contracts.perp.openLong(leverage, { value })
        : await contracts.perp.openShort(leverage, { value });
      setTxHash(tx.hash);
      await tx.wait();
      setCollateral(""); setSliderPct(0);
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.root}>
      {/* ── TICKER STRIP ── */}
      <div style={s.ticker}>
        <div style={s.tickerLeft}>
          <div style={s.badge}>OPN</div>
          <div>
            <div style={s.pair}>OPN <span style={{color: COLORS.dimmed}}>/</span> USD</div>
            <div style={s.pairSub}>Perpetual · OPN Testnet</div>
          </div>
          <div style={s.bigPrice}>${priceUSD || "—"}</div>
          <div style={{
            ...s.changePill,
            background: isUp ? COLORS.greenLo  : COLORS.redLo,
            border:     isUp ? `1px solid ${COLORS.greenBd}` : `1px solid ${COLORS.redBd}`,
            color:      isUp ? COLORS.green     : COLORS.red,
          }}>
            {isUp ? "▲" : "▼"} {Math.abs(pctChange).toFixed(2)}%
          </div>
        </div>

        <div style={s.tickerRight}>
  {[
    { label: "Mark Price", val: priceUSD ? `$${parseFloat(priceUSD).toFixed(6)}` : "—" },
    { label: "24h High",   val: high24 ? `$${Math.max(high24, parseFloat(priceUSD||0)).toFixed(6)}` : "—" },
    { label: "24h Low",    val: low24  ? `$${Math.min(low24,  parseFloat(priceUSD||0)).toFixed(6)}`  : "—" },
    { label: "Oracle",     val: "CoinGecko" },
    { label: "Network",    val: "OPN Chain" },
  ].map(({ label, val }) => (
    <div key={label} style={s.stat}>
      <span style={s.statLabel}>{label}</span>
      <span style={s.statVal}>{val}</span>
    </div>
  ))}
  <div style={s.livePill}><span style={s.liveDot}/> LIVE</div>
</div>
      </div>

      {/* ── BODY ── */}
      <div style={s.body}>

        {/* ── LEFT CHART COLUMN ── */}
        <div style={s.chartCol}>
          <div style={s.chartBar}>
  <div style={{display:"flex", alignItems:"center", gap:8}}>
    <span style={{color:"rgba(123,63,228,0.8)", background:"rgba(123,63,228,0.12)", border:"1px solid rgba(123,63,228,0.3)", borderRadius:6, padding:"4px 10px", fontSize:10, letterSpacing:"0.08em", fontFamily:"inherit"}}>
      ⬡ LIVE · 30s Oracle
    </span>
    <span style={{fontSize:10, color:COLORS.dimmed}}>OPN/USD · OPN Testnet</span>
  </div>
  <div style={s.ctRow}>
    {["Line","Candle"].map(t => (
      <button key={t} onClick={() => setChartType(t)} style={{
        ...s.ctBtn,
        color:      chartType === t ? COLORS.lavender : COLORS.muted,
        background: chartType === t ? "rgba(123,63,228,0.12)" : "transparent",
      }}>{t}</button>
    ))}
  </div>
</div>

          {/* Chart canvas */}
          <div style={s.chartWrap}>
            {priceHistory.length > 1
              ? <LWChart data={priceHistory} isUp={isUp} type={chartType} tf={tf} />
              : <ChartLoader />}
          </div>
        </div>

        {/* ── RIGHT ORDER PANEL ── */}
        <div style={s.orderCol}>

          {/* Buy/Sell */}
          <div style={s.bsTabs}>
            {["LONG","SHORT"].map(dir => (
              <button key={dir} onClick={() => setSide(dir)} style={{
                ...s.bsBtn,
                background: side === dir
                  ? dir === "LONG"
                    ? "linear-gradient(135deg,#166534,#22C55E)"
                    : "linear-gradient(135deg,#991B1B,#EF4444)"
                  : "transparent",
                color:  side === dir ? "#fff" : COLORS.muted,
                border: side === dir ? "none" : `1px solid ${COLORS.border}`,
                boxShadow: side === dir
                  ? dir === "LONG"
                    ? "0 4px 20px rgba(34,197,94,0.25)"
                    : "0 4px 20px rgba(239,68,68,0.25)"
                  : "none",
              }}>{dir}</button>
            ))}
          </div>

          {/* Order type */}
          <div style={s.otRow}>
            {["Market","Limit"].map(ot => (
              <button key={ot} onClick={() => setOrderType(ot)} style={{
                ...s.otBtn,
                color:      orderType === ot ? COLORS.lavender : COLORS.muted,
                borderBottom: orderType === ot ? `2px solid ${COLORS.violet}` : "2px solid transparent",
              }}>{ot}</button>
            ))}
          </div>

          {/* Limit price input (only when Limit) */}
          {orderType === "Limit" && (
            <div style={s.inputBox}>
              <span style={s.inputLabel}>Limit Price</span>
              <input
                style={s.input}
                type="number"
                placeholder={priceUSD || "0.000000"}
                value={limitPrice}
                onChange={e => setLimitPrice(e.target.value)}
              />
              <span style={{...s.inputUnit, color: COLORS.muted}}>OPN</span>
            </div>
          )}

          {/* Collateral input */}
          <div style={{
            ...s.inputBox,
            borderColor: side === "LONG" ? COLORS.greenBd : COLORS.redBd,
          }}>
            <span style={s.inputLabel}>Collateral</span>
            <input
              style={s.input}
              type="number"
              placeholder="0.0000"
              value={collateral}
              onChange={e => {
                setCollateral(e.target.value);
                setSliderPct(Math.min(100, Math.round(parseFloat(e.target.value || 0) * 100)));
              }}
              min="0.001" step="0.001"
            />
            <span style={{...s.inputUnit, color: side === "LONG" ? COLORS.green : COLORS.red}}>OPN</span>
          </div>

          {/* Slider */}
          <div style={s.sliderArea} onClick={handleSliderClick}>
            <div style={s.sliderTrack}>
              <div style={{
                ...s.sliderFill,
                width: `${sliderPct}%`,
                background: side === "LONG"
                  ? `linear-gradient(90deg, ${COLORS.violet}, ${COLORS.green})`
                  : `linear-gradient(90deg, ${COLORS.violet}, ${COLORS.red})`,
              }}/>
              <div style={{
                ...s.sliderThumb,
                left: `${sliderPct}%`,
                borderColor: side === "LONG" ? COLORS.green : COLORS.red,
              }}/>
            </div>
            <div style={s.sliderPcts}>
              {[0,25,50,75,100].map(p => (
                <span key={p} style={{
                  ...s.sliderPctTick,
                  color: sliderPct >= p ? COLORS.textSub : COLORS.dimmed,
                }}>{p}%</span>
              ))}
            </div>
          </div>

          <div style={s.divider}/>

          {/* Leverage */}
          <div style={s.levSection}>
            <span style={s.sectionLabel}>LEVERAGE</span>
            <div style={s.levGrid}>
              {LEVERAGES.map(lev => (
                <button key={lev} onClick={() => setLeverage(lev)} style={{
                  ...s.levBtn,
                  background:  leverage === lev ? "rgba(123,63,228,0.22)" : "rgba(255,255,255,0.02)",
                  border:      leverage === lev ? `1px solid ${COLORS.violet}` : `1px solid ${COLORS.border}`,
                  color:       leverage === lev ? COLORS.lavender : COLORS.muted,
                  boxShadow:   leverage === lev ? `0 0 14px rgba(123,63,228,0.3)` : "none",
                }}>{lev}×</button>
              ))}
            </div>
          </div>

          <div style={s.divider}/>

          {/* Order details */}
          <div style={s.details}>
            {[
              { label: "Entry Price",   val: entryPrice > 0 ? `$${entryPrice.toFixed(6)}` : "—", color: COLORS.text },
              { label: "Position Size", val: positionSize > 0 ? `${positionSize.toFixed(4)} OPN` : "—", color: COLORS.text },
              { label: "Liq. Price",    val: liqPrice ? `$${liqPrice}` : "—", color: side === "LONG" ? COLORS.red : COLORS.green },
              { label: "Max Slippage",  val: "0.5%", color: COLORS.textSub },
              { label: "Gas Fee",       val: "~0.001 OPN", color: COLORS.muted },
            ].map(({ label, val, color }) => (
              <div key={label} style={s.detailRow}>
                <span style={s.detailLabel}>{label}</span>
                <span style={{ ...s.detailVal, color }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Error / TX feedback */}
          {error && <div style={s.errBox}>⚠ {error}</div>}
          {txHash && !loading && (
            <div style={s.txBox}>
              ✓ <a href={`https://testnet.iopn.tech/tx/${txHash}`} target="_blank" rel="noreferrer"
                   style={{ color: COLORS.lavender }}>View on OPN Explorer →</a>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={isConnected ? openPosition : undefined}
            disabled={loading}
            style={{
              ...s.submitBtn,
              background: !isConnected || loading
                ? COLORS.surface
                : side === "LONG"
                  ? "linear-gradient(135deg,#166534,#22C55E)"
                  : "linear-gradient(135deg,#991B1B,#EF4444)",
              color:     !isConnected || loading ? COLORS.muted : "#fff",
              cursor:    loading || !isConnected ? "not-allowed" : "pointer",
              boxShadow: isConnected && !loading
                ? side === "LONG"
                  ? "0 6px 32px rgba(34,197,94,0.3)"
                  : "0 6px 32px rgba(239,68,68,0.3)"
                : "none",
            }}
          >
            {!isConnected
              ? "Connect Wallet"
              : loading
                ? "Confirming…"
                : `${side === "LONG" ? "Buy / Long" : "Sell / Short"} ${leverage}×`}
          </button>

          {/* Footer */}
          <div style={s.footerBadge}>
            <span style={s.footerDot}/>
            <span style={s.footerText}>OPN Chain · Season 1 · DeFi</span>
          </div>
        </div>


        
      </div>
<div style={{
  marginTop: "16px",
  borderTop: "1px solid rgba(124,140,255,0.10)",
  padding: "0 16px",
}}>

{/* ── PROTOCOL STATS ── */}
<div style={{
  display: "grid",
  gridTemplateColumns: "repeat(3,1fr)",
  gap: 16,
  padding: "24px 0 0",    // ← removed side padding, parent handles it
  marginBottom: "32px",   // ← THIS is the gap between stats and info cards
}}>
  {[
    { icon: "◎", label: "TOTAL VOLUME",   val: `${stats.volume > 0 ? stats.volume.toFixed(5) : "0.00000"} OPN`,   sub: "24h", color: COLORS.green },
    { icon: "⇅", label: "OPEN INTEREST",  val: `${stats.openInterest > 0 ? stats.openInterest.toFixed(5) : "0.00000"} OPN`, sub: "24h", color: COLORS.green },
    { icon: "◈", label: "ACTIVE TRADERS", val: `${stats.activeTraders > 0 ? stats.activeTraders : "0"}`,           sub: "24h", color: COLORS.lavender },
  ].map(({ icon, label, val, sub, color }) => (
    <div key={label} style={{
      background: "rgba(13,10,26,0.8)",
      border: "1px solid rgba(123,63,228,0.20)",
      borderRadius: 14,
      padding: "18px 20px",
      display: "flex",
      alignItems: "center",
      gap: 16,
    }}>
      <span style={{ fontSize: 28, color: COLORS.violet }}>{icon}</span>
      <div>
        <div style={{ fontSize: 9, color: COLORS.dimmed, letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "monospace" }}>{val}</div>
        <div style={{ fontSize: 9, color: COLORS.dimmed, marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  ))}
</div>
  <div style={s.opnSection}>

  {/* Card 1 — Oracle */}
  <div style={s.opnCard}>
    <div style={s.cardIllustration}>
      <svg width="100%" height="100%" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="g1" cx="30%" cy="60%" r="60%">
            <stop offset="0%" stopColor="#7B3FE4" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="#0A0812" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <rect width="400" height="200" fill="url(#g1)"/>
        {/* Circle backdrop */}
        <circle cx="100" cy="110" r="70" fill="none" stroke="rgba(123,63,228,0.25)" strokeWidth="1"/>
        <circle cx="100" cy="110" r="50" fill="rgba(123,63,228,0.12)" stroke="rgba(123,63,228,0.3)" strokeWidth="1"/>
        {/* OPN logo placeholder */}
        <text x="100" y="118" textAnchor="middle" fill="white" fontSize="22" fontWeight="700">⟁</text>
        {/* Price line chart */}
        <polyline points="180,160 210,130 240,145 270,100 300,115 330,80 360,60 390,40"
          fill="none" stroke="#7B3FE4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="390" cy="40" r="4" fill="#A259FF"/>
        <circle cx="270" cy="100" r="3" fill="rgba(162,89,255,0.6)"/>
        {/* Dots decoration */}
        <circle cx="160" cy="60" r="3" fill="rgba(123,63,228,0.5)"/>
        <circle cx="370" cy="130" r="2" fill="rgba(123,63,228,0.3)"/>
      </svg>
    </div>
    <div style={s.cardBody}>
      <div style={s.cardLiveBadge}>
        <span style={{ color: COLORS.green, fontSize: 8 }}>●</span> LIVE · COINGECKO
      </div>
      <h3 style={s.cardTitle}>Oracle Price Feed</h3>
      <p style={s.cardDesc}>Real-time OPN/USD pricing sourced from CoinGecko and pushed on-chain every 30 seconds by the keeper network.</p>
    </div>
  </div>

  {/* Card 2 — Perpetuals */}
  <div style={s.opnCard}>
    <div style={s.cardIllustration}>
      <svg width="100%" height="100%" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="g2" cx="50%" cy="80%" r="60%">
            <stop offset="0%" stopColor="#7B3FE4" stopOpacity="0.5"/>
            <stop offset="100%" stopColor="#0A0812" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <rect width="400" height="200" fill="url(#g2)"/>
        {/* Platform glow */}
        <ellipse cx="200" cy="170" rx="80" ry="12" fill="rgba(123,63,228,0.4)"/>
        <ellipse cx="200" cy="162" rx="60" ry="8" fill="rgba(162,89,255,0.3)"/>
        {/* OPN arch */}
        <text x="200" y="148" textAnchor="middle" fill="white" fontSize="36" fontWeight="800">⟁</text>
        {/* Candles */}
        {[[120,60,100,80],[150,50,90,70],[310,55,95,75],[340,65,105,85],[370,45,85,65]].map(([x,h,t,b],i) => (
          <g key={i}>
            <line x1={x} y1={t-15} x2={x} y2={h+15} stroke="rgba(162,89,255,0.5)" strokeWidth="1.5"/>
            <rect x={x-5} y={h} width="10" height={b-h} fill="rgba(123,63,228,0.6)" rx="1"/>
          </g>
        ))}
      </svg>
    </div>
    <div style={s.cardBody}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <div style={s.cardIconBox}>⇅</div>
        <h3 style={s.cardTitle}>Trade Perpetuals</h3>
      </div>
      <p style={s.cardDesc}>Go long or short on OPN with up to 10× leverage. Positions are settled on-chain against the liquidity vault.</p>
      <div style={{ display:"flex", gap:8, marginTop:12 }}>
        {["2×","5×","10×"].map(l => (
          <span key={l} style={s.cardTag}>{l}</span>
        ))}
      </div>
    </div>
  </div>

  {/* Card 3 — Vault */}
  <div style={s.opnCard}>
    <div style={s.cardIllustration}>
      <svg width="100%" height="100%" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="g3" cx="70%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#7B3FE4" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="#0A0812" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <rect width="400" height="200" fill="url(#g3)"/>
        {/* Shield */}
        <path d="M260,30 L320,55 L320,120 Q320,155 260,175 Q200,155 200,120 L200,55 Z"
          fill="rgba(123,63,228,0.20)" stroke="rgba(162,89,255,0.5)" strokeWidth="1.5"/>
        {/* OPN in shield */}
        <text x="260" y="115" textAnchor="middle" fill="white" fontSize="28" fontWeight="700">⟁</text>
        {/* Lock badge */}
        <circle cx="310" cy="150" r="18" fill="rgba(123,63,228,0.5)" stroke="rgba(162,89,255,0.6)" strokeWidth="1.5"/>
        <text x="310" y="156" textAnchor="middle" fill="white" fontSize="14">🔒</text>
        {/* Dots */}
        <circle cx="100" cy="80" r="4" fill="rgba(123,63,228,0.4)"/>
        <circle cx="130" cy="140" r="3" fill="rgba(123,63,228,0.3)"/>
        <circle cx="80" cy="150" r="2" fill="rgba(162,89,255,0.3)"/>
      </svg>
    </div>
    <div style={s.cardBody}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <div style={s.cardIconBox}>⬡</div>
        <h3 style={s.cardTitle}>Secure Vault</h3>
      </div>
      <p style={s.cardDesc}>All collateral is locked and managed entirely on OPN Chain. No custody. No intermediaries. Full on-chain settlement.</p>
      <div style={{ display:"flex", gap:8, marginTop:12 }}>
        <span style={s.cardTag}>OPN CHAIN</span>
        <span style={s.cardTag}>NON-CUSTODIAL</span>
      </div>
    </div>
  </div>

</div>
</div>

<div style={{
  marginTop: "16px",
  padding: "0 16px 16px",
  textAlign: "center",
}}>
  
    <a href="https://faucet.iopn.tech"
    target="_blank"
    rel="noreferrer"
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11,
      fontWeight: 700,
      color: "#a78bfa",
      textDecoration: "none",
      background: "rgba(123,63,228,0.12)",
      border: "1px solid rgba(123,63,228,0.3)",
      borderRadius: 8,
      padding: "8px 16px",
      letterSpacing: "0.06em",
      fontFamily: "inherit",
    }}
  >
    ⬡ Get Test OPN from Faucet →
  </a>
</div>
    </div>
  );
}

// ── Lightweight Charts v5 component ─────────────────────────────────────────
function LWChart({ data, isUp, type, tf }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || data.length < 2) return;

    const lc   = isUp ? COLORS.green  : COLORS.red;
    const lcLo = isUp ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)";

    const chart = createChart(ref.current, {
      layout: {
  background: {
    type: ColorType.Solid,
  color: "#0A0812",
  },
  textColor: COLORS.muted,
  fontFamily: "'Syne Mono', monospace",
  fontSize: 11,
},
     grid: {
  vertLines: { color: "rgba(162,89,255,0.07)" },
  horzLines: { color: "rgba(162,89,255,0.10)" },
},
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(162,89,255,0.4)", width: 1, style: 2, labelBackgroundColor: COLORS.panel },
        horzLine: { color: "rgba(162,89,255,0.3)", width: 1, style: 2, labelBackgroundColor: COLORS.panel },
      },
      rightPriceScale: {
  borderColor: "rgba(123,63,228,0.20)",
  textColor: "rgba(183,168,230,0.70)",
  scaleMargins: { top: 0.10, bottom: 0.10 },
  borderVisible: true,
},
timeScale: {
  borderColor: "rgba(123,63,228,0.20)",
  textColor: "rgba(183,168,230,0.70)",
  timeVisible: true,
  secondsVisible: tf === "1M",
  fixLeftEdge: true,
  fixRightEdge: true,
},
      autoSize: true,
    });

    
   

    if (type === "Candle") {
      const series = chart.addSeries(CandlestickSeries, {
        upColor:      COLORS.green,
        downColor:    COLORS.red,
        borderUpColor:   COLORS.green,
        borderDownColor: COLORS.red,
        wickUpColor:     COLORS.green,
        wickDownColor:   COLORS.red,
      });
      // Build synthetic candles from price data
    const seen2 = new Set();
const candles = data
  .map((d, i) => {
    const p = d.price;
    const noise = p * 0.002;
    return {
      time:  Math.floor(d.timestamp / 1000),
      open:  i === 0 ? p : data[i-1].price,
      high:  p + noise,
      low:   p - noise,
      close: p,
    };
  })
  .filter(d => {
    if (d.time <= 0 || seen2.has(d.time)) return false;
    seen2.add(d.time);
    return true;
  })
  .sort((a, b) => a.time - b.time);
      series.setData(candles);
    } else {
    const series = chart.addSeries(AreaSeries, {
  lineColor: lc,
  topColor: isUp ? "rgba(34,197,94,0.30)" : "rgba(239,68,68,0.30)",
  bottomColor: isUp ? "rgba(34,197,94,0.01)" : "rgba(239,68,68,0.01)",
  lineWidth: 2,
  crosshairMarkerRadius: 5,
  crosshairMarkerBorderColor: lc,
  crosshairMarkerBackgroundColor: "#100D20",
  priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
});
     const seen = new Set();
const lineData = data
  .map(d => ({
    time:  Math.floor(d.timestamp / 1000),
    value: d.price,
  }))
  .filter(d => {
    if (d.time <= 0 || seen.has(d.time)) return false;
    seen.add(d.time);
    return true;
  })
  .sort((a, b) => a.time - b.time);
      series.setData(lineData);
    }

    chart.timeScale().fitContent();

    // Tooltip
    const tip = document.createElement("div");
    tip.style.cssText = [
      "position:absolute","top:10px","left:12px","z-index:20",
      `background:${COLORS.panel}`,
      `border:1px solid ${COLORS.borderHi}`,
      "border-radius:8px","padding:8px 12px","pointer-events:none",
      "font-family:'Syne Mono',monospace","font-size:11px",
      "display:none","min-width:130px",
    ].join(";");
    ref.current.style.position = "relative";
    ref.current.appendChild(tip);

    chart.subscribeCrosshairMove(param => {
  if (!param.point || !param.time || !param.seriesData || param.seriesData.size === 0) {
    tip.style.display = "none";
    return;
  }
  let price = null;
  param.seriesData.forEach((val) => {
    price = typeof val === "object" ? (val.close ?? val.value ?? null) : val;
  });
  if (price === null || price === undefined) { tip.style.display = "none"; return; }
  const d  = new Date(param.time * 1000);
  const ts = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dt = d.toLocaleDateString([], { month: "short", day: "numeric" });
  tip.style.display = "block";
  tip.innerHTML = `
    <div style="color:${COLORS.muted};font-size:9px;letter-spacing:.08em;margin-bottom:4px">${dt} · ${ts}</div>
    <div style="color:${lc};font-size:16px;font-weight:700;letter-spacing:0.02em">$${Number(price).toFixed(6)}</div>
    <div style="color:${COLORS.dimmed};font-size:9px;margin-top:3px">OPN / USD · OPN Testnet
    
    
    </div>
  `;
});

    return () => chart.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.length, isUp, type, tf]);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}

function ChartLoader() {
  return (
    <div style={s.loader}>
      <svg width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="13" fill="none" stroke={COLORS.border} strokeWidth="2"/>
        <circle cx="16" cy="16" r="13" fill="none" stroke={COLORS.violet} strokeWidth="2"
          strokeDasharray="30 52" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate"
            from="0 16 16" to="360 16 16" dur="1s" repeatCount="indefinite"/>
        </circle>
      </svg>
      <span style={{ color: COLORS.muted, fontSize: 12, marginTop: 8 }}>Collecting price data…</span>
      <span style={{ color: COLORS.dimmed, fontSize: 10 }}>Updates every 30s via CoinGecko</span>
    </div>



  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = {
 root: {
  display: "flex",
  flexDirection: "column",
  background: "#0D0A1A",        // ← replace the whole radial-gradient
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace",
  color: COLORS.text,
  boxSizing: "border-box",
},

  // ── Ticker
 ticker: {
  flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "8px 18px",
  borderBottom: `1px solid ${COLORS.border}`,
  background: "#0A0812",        // ← was rgba(13,10,26,0.85)
  backdropFilter: "blur(16px)",
  flexWrap: "wrap", gap: 10,
  position: "sticky",
  top: 0,
  zIndex: 10,
},
  tickerLeft:  { display: "flex", alignItems: "center", gap: 12 },
  badge: {
    background: `linear-gradient(135deg, ${COLORS.violet}, ${COLORS.violetLo})`,
    borderRadius: 7, padding: "5px 10px",
    fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#fff",
    boxShadow: `0 0 14px rgba(123,63,228,0.4)`,
  },
  pair:    { fontSize: 13, fontWeight: 700, color: COLORS.text, letterSpacing: "0.04em" },
  pairSub: { fontSize: 9,  color: COLORS.muted, letterSpacing: "0.06em" },
  bigPrice: { fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: COLORS.text },
  changePill: {
    fontSize: 10, fontWeight: 700, padding: "3px 9px",
    borderRadius: 20, letterSpacing: "0.04em",
  },
  tickerRight: { display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" },
  stat:        { display: "flex", flexDirection: "column", gap: 2 },
  statLabel: { fontSize: 10, color: COLORS.dimmed, letterSpacing: "0.04em" },
  statVal:     { fontSize: 11, color: COLORS.textSub, fontFamily: "monospace", fontWeight: 600 },
  livePill: {
    display: "flex", alignItems: "center", gap: 5,
    background: "rgba(34,197,94,0.08)", border: `1px solid ${COLORS.greenBd}`,
    borderRadius: 20, padding: "4px 10px",
    fontSize: 10, fontWeight: 700, color: COLORS.green, letterSpacing: "0.08em",
  },
  liveDot: {
    width: 5, height: 5, borderRadius: "50%",
    background: COLORS.green, boxShadow: `0 0 6px ${COLORS.green}`, display: "inline-block",
  },

  // ── Body
 body: {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) 320px",
  height: "780px",
  overflow: "hidden",
  margin: "0 16px",
  alignItems: "start",
  borderBottom: "1px solid rgba(123,63,228,0.15)",  // ← visual floor
  paddingBottom: "0",
},

  // ── Chart
chartCol: {
  height: "780px",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "linear-gradient(180deg, #0C0920 0%, #080614 100%)",
  border: "1px solid rgba(123,63,228,0.30)",
  borderRadius: "16px 0 0 16px",
  boxShadow: "inset 0 1px 0 rgba(162,89,255,0.12), 0 0 60px rgba(123,63,228,0.08)",
},
 chartBar: {
  flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "8px 16px",
  borderBottom: "1px solid rgba(123,63,228,0.18)",
  background: "linear-gradient(90deg, rgba(18,12,36,0.95), rgba(12,8,24,0.95))",
  backdropFilter: "blur(20px)",
},
  tfRow: { display: "flex", gap: 2 },
  tfBtn: {
  padding: "5px 10px", borderRadius: 6, border: "1px solid transparent",
  fontSize: 11, fontWeight: 700, cursor: "pointer",
  fontFamily: "inherit", transition: "all 0.15s",
  letterSpacing: "0.04em",
},
  ctRow: { display: "flex", gap: 2 },
  ctBtn: {
    padding: "4px 9px", border: "none", borderRadius: 5,
    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
 chartWrap: {
  flex: 1,
  minHeight: 0,          // ← critical flex fix
  overflow: "hidden",
},

  // ── Order Panel
orderCol: {
  height: "780px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "12px 16px",
  background: "linear-gradient(180deg, #100D20 0%, #0A0818 100%)",
  border: "1px solid rgba(123,63,228,0.30)",
  borderLeft: "1px solid rgba(123,63,228,0.15)",
  borderRadius: "0 16px 16px 0",
  overflow: "hidden",
  boxSizing: "border-box",
  justifyContent: "space-between",
  boxShadow: "inset 0 1px 0 rgba(162,89,255,0.08)",
},

  bsTabs: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 },
  bsBtn: {
    padding: "9px 0", borderRadius: 8,
    fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.2s", letterSpacing: "0.06em",
  },

  otRow: {
    display: "flex", borderBottom: `1px solid ${COLORS.border}`,
  },
  otBtn: {
    flex: 1, padding: "7px 0", background: "transparent", border: "none",
    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    letterSpacing: "0.04em", transition: "all 0.15s",
  },

 inputBox: {
  display: "flex", alignItems: "center",
  background: "rgba(255,255,255,0.04)",  // ← slightly lighter so it's visible on dark bg
  border: `1px solid ${COLORS.border}`,
  borderRadius: 9, padding: "11px 14px",
  gap: 8, transition: "border-color 0.2s",
},
 inputLabel: { fontSize: 10, color: COLORS.muted, letterSpacing: "0.08em", flexShrink: 0 },

 input: {
  flex: 1, background: "transparent", border: "none", outline: "none",
  color: COLORS.text, fontSize: 20, fontWeight: 700, fontFamily: "monospace",  // ← was 18
  minWidth: 0,
},
  inputUnit: { fontSize: 12, fontWeight: 700, flexShrink: 0 },

  sliderArea: {
    cursor: "pointer", padding: "4px 0",
    userSelect: "none",
  },
  sliderTrack: {
    height: 4, background: COLORS.border, borderRadius: 4,
    position: "relative", margin: "8px 0",
  },
  sliderFill: {
    height: "100%", borderRadius: 4,
    transition: "width 0.1s",
    position: "absolute", top: 0, left: 0,
  },
  sliderThumb: {
    width: 14, height: 14, borderRadius: "50%",
    background: COLORS.panel,
    border: `2px solid ${COLORS.green}`,
    position: "absolute", top: "50%",
    transform: "translate(-50%, -50%)",
    transition: "left 0.1s, border-color 0.2s",
    boxShadow: "0 0 8px rgba(34,197,94,0.4)",
  },
  sliderPcts: {
    display: "flex", justifyContent: "space-between",
    marginTop: 4,
  },
  sliderPctTick: { fontSize: 9, transition: "color 0.15s", cursor: "pointer" },

  divider: {
    height: 1,
    background: `linear-gradient(90deg, transparent, ${COLORS.border}, transparent)`,
  },

  levSection: { display: "flex", flexDirection: "column", gap: 7 },
  sectionLabel: { fontSize: 9, color: COLORS.muted, letterSpacing: "0.1em", fontWeight: 700 },
  levGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 },
  levBtn: {
    padding: "8px 0", borderRadius: 8,
    fontSize: 13, fontWeight: 800, cursor: "pointer",
    transition: "all 0.18s", fontFamily: "inherit",
    letterSpacing: "0.04em",
  },

details: {
  display: "flex",
  flexDirection: "column",
  gap: 10,                // ← bigger gap between rows
},
  detailRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { fontSize: 11, color: COLORS.muted },        // ← was 10
detailVal:   { fontSize: 11, fontWeight: 700, fontFamily: "monospace" },  // ← was 10

  errBox: {
    background: COLORS.redLo, border: `1px solid ${COLORS.redBd}`,
    borderRadius: 7, padding: "8px 10px", fontSize: 10, color: COLORS.red,
    wordBreak: "break-all",
  },
  txBox: {
    background: "rgba(123,63,228,0.08)", border: `1px solid rgba(162,89,255,0.25)`,
    borderRadius: 7, padding: "8px 10px", fontSize: 10,
  },

 // submitBtn — no marginTop auto, just a small fixed gap:
submitBtn: {
  width: "100%",
  padding: "14px",       // ← slightly taller
  borderRadius: 10,
  border: "none",
  fontSize: 13,          // ← was 12
  fontWeight: 800,
  letterSpacing: "0.06em",
  transition: "all 0.2s",
  flexShrink: 0,
  fontFamily: "inherit",
  marginTop: 0,          // ← no margin, justifyContent handles spacing
},

 // Change footerBadge style:
footerBadge: {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  paddingTop: 6,
  flexShrink: 0,
},

  footerDot: {
    width: 5, height: 5, borderRadius: "50%",
    background: COLORS.violet, boxShadow: `0 0 6px ${COLORS.violet}`, display: "inline-block",
  },
  footerText: { fontSize: 9, color: COLORS.dimmed, letterSpacing: "0.08em" },

opnSection: {
  display: "grid",
  gridTemplateColumns: "repeat(3,1fr)",
  gap: "20px",
  // NO marginTop here — parent wrapper owns the spacing
},

opnCard: {
  background: "rgba(10,8,20,0.95)",
  border: "1px solid rgba(123,63,228,0.22)",
  borderRadius: 16,
  padding: 0,             // ← remove padding, cardBody owns it
  overflow: "hidden",     // ← so illustration clips to border-radius
  backdropFilter: "blur(18px)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  transition: "border-color 0.2s",
},
// ← paste all new styles here, before the closing };
  cardIllustration: {
    width: "100%",
    height: 180,
    overflow: "hidden",
    borderRadius: "14px 14px 0 0",
    background: "linear-gradient(180deg, #0E0B1E 0%, #0A0818 100%)",
    flexShrink: 0,
  },
  cardBody: {
    padding: "20px 22px 22px",
  },
  cardLiveBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 9,
    fontWeight: 700,
    color: COLORS.muted,
    letterSpacing: "0.1em",
    border: "1px solid rgba(123,63,228,0.3)",
    borderRadius: 20,
    padding: "3px 10px",
    marginBottom: 10,
  },
  cardTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: COLORS.text,
  },
  cardDesc: {
    margin: 0,
    fontSize: 11,
    color: COLORS.muted,
    lineHeight: 1.7,
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: "rgba(123,63,228,0.2)",
    border: "1px solid rgba(123,63,228,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    flexShrink: 0,
  },
  cardTag: {
    fontSize: 9,
    fontWeight: 700,
    color: COLORS.muted,
    letterSpacing: "0.08em",
    border: "1px solid rgba(123,63,228,0.25)",
    borderRadius: 6,
    padding: "3px 8px",
  },

};  // ← s object closes here
