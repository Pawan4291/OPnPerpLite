import { useMemo } from "react";
import { ethers } from "ethers";
import { DEPLOYED_ADDRESSES, ORACLE_ABI, VAULT_ABI, PERP_ABI } from "../utils/config";

export function useContracts(signer, provider) {
  const contracts = useMemo(() => {
    const conn = signer || provider;
    if (!conn) return null;
    return {
      oracle: new ethers.Contract(DEPLOYED_ADDRESSES.OracleKeeper, ORACLE_ABI, conn),
      vault: new ethers.Contract(DEPLOYED_ADDRESSES.LiquidityVault, VAULT_ABI, conn),
      perp: new ethers.Contract(DEPLOYED_ADDRESSES.PerpEngine, PERP_ABI, conn)
    };
  }, [signer, provider]);
  return contracts;
}
