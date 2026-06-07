# OPN Perp Lite — Perpetual DEX on OPN Chain

> Season 1 · DeFi & Open Finance · IOPn Builder's Programme

The first perpetuals trading protocol deployed on OPN Chain. Trade OPN with up to 10× leverage against a shared liquidity vault. Real liquidations. Real PnL. Fully on-chain.

## Live Demo
**[https://opnperplite.vercel.app](https://opnperplite.vercel.app)**

## Links
- 🌐 Live App: https://opnperplite.vercel.app
- 🐦 X/Twitter: https://x.com/OPNPerpLite
- 🔍 OracleKeeper: https://testnet.iopn.tech/address/0x688428b07903c792AF70994Fd4C11Cd0eB33E76D
- 🔍 LiquidityVault: https://testnet.iopn.tech/address/0xE73b20FDD21E23EFd861baf5a5f88775E3695969
- 🔍 PerpEngine: https://testnet.iopn.tech/address/0x4a7acf3Bba2A15d5493f7C772C96d2e28b5C9836

## Why OPN Perp Lite

OPN Chain had no price discovery mechanism for OPN token holders. No way to hedge. No way to express a directional view without leaving the chain.

OPN Perp Lite fixes that. It is the first protocol where OPN holders can long or short OPN natively — collateral stays on OPN Chain, settlement happens on OPN Chain, liquidations happen on OPN Chain. No bridges. No wrapped assets. No off-chain settlement.

<img width="1475" height="764" alt="Screenshot Capture - 2026-06-07 - 11-47-08" src="https://github.com/user-attachments/assets/f5064670-067c-4590-bcf3-13908fa0ef20" />

## Deployed Contracts — OPN Testnet (Chain ID: 984)

| Contract | Address | Explorer |
|---|---|---|
| OracleKeeper | `0x688428b07903c792AF70994Fd4C11Cd0eB33E76D` | [View](https://testnet.iopn.tech/address/0x688428b07903c792AF70994Fd4C11Cd0eB33E76D) |
| LiquidityVault | `0xE73b20FDD21E23EFd861baf5a5f88775E3695969` | [View](https://testnet.iopn.tech/address/0xE73b20FDD21E23EFd861baf5a5f88775E3695969) |
| PerpEngine | `0x4a7acf3Bba2A15d5493f7C772C96d2e28b5C9836` | [View](https://testnet.iopn.tech/address/0x4a7acf3Bba2A15d5493f7C772C96d2e28b5C9836) |

## Architecture

```
CoinGecko API → keeper.js (Railway, 24/7)
                      ↓ setPrice() every 30s
              OracleKeeper.sol
                      ↓ getPrice()
PerpEngine.sol ←——→ LiquidityVault.sol
                      ↓
        Frontend (React + Vite, Vercel)
```

## How It Works

**For Traders**
1. Connect MetaMask → auto-adds OPN Chain (984)
2. Get testnet OPN from [faucet](https://faucet.iopn.tech)
3. Deposit collateral → choose leverage (2×, 5×, 10×)
4. Open LONG or SHORT position
5. Monitor PnL and health factor in real time
6. Close position anytime — profit paid from vault

**For Liquidity Providers**
1. Deposit OPN into LiquidityVault
2. Earn proportional share of trader losses
3. Withdraw anytime (when liquidity available)

**Liquidation Engine**
- keeper.js checks all positions every 30s
- If health factor drops to 0 → auto-liquidated
- 5% liquidation bonus paid to keeper
- Remaining collateral goes to vault

## OPN Chain Integration
- Deployed on OPN Testnet (Chain ID: 984)
- Native OPN token as collateral
- Price oracle reads real OPN/USD from CoinGecko
- All contracts verified on testnet.iopn.tech
- Keeper running 24/7 on Railway
- Deployer wallet matches builder profile on builders.iopn.tech

## Tech Stack
- **Contracts**: Solidity 0.8.20, Hardhat
- **Frontend**: React + Vite, lightweight-charts, ethers.js v6
- **Oracle**: Node.js keeper on Railway
- **Deployment**: Vercel (frontend), Railway (keeper)

## Local Development

```bash
# Install dependencies
npm install
cd frontend && npm install
cd ../keeper && npm install

# Deploy contracts
npx hardhat run scripts/deploy.js --network opn_testnet

# Run keeper locally
cd keeper && node keeper.js

# Run frontend
cd frontend && npm run dev
```

## Roadmap

### Season 1 (Current)
- [x] 3 contracts deployed and verified on OPN Testnet
- [x] Live keeper running 24/7 on Railway
- [x] Trade, Positions, Liquidity, Leaderboard pages
- [x] Auto-liquidation engine with 5% keeper bonus
- [x] 28 passing tests
- [ ] Limit orders
- [ ] Funding rates

### Season 2
- [ ] Gelato Network automation replacing centralised keeper
- [ ] NeoCard tier-gated fee discounts (Legendary = 0.1% vs 0.3% base)
- [ ] Multi-asset support (OPNT, WOPN)
- [ ] On-chain leaderboard with soulbound achievement badges

### Mainnet
- [ ] Security audit
- [ ] Mainnet deployment
- [ ] Mobile app
- [ ] DAO governance for vault parameters

## Builder Info
- **Programme**: IOPn Builder's Programme Season 1
- **Category**: DeFi & Open Finance
- **Deployer**: `0x261Df906EDA2Fd7F1e47770D9B380715d3076B96`
