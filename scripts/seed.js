require("dotenv").config();
const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const vault = new ethers.Contract(
  process.env.VAULT_ADDRESS,
  ["function deposit() external payable"],
  wallet
);

vault.deposit({ value: ethers.parseEther("5") })
  .then(tx => tx.wait())
  .then(() => console.log("✅ Done — vault has 5 OPN, trading is now open"))
  .catch(console.error);