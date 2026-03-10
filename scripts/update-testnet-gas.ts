import pkg from "hardhat";
const { ethers } = pkg;
import "dotenv/config";

const PROXY = "0xB9aD3787972d41c772ffc752b2c0687a37296731";

// ~2.8 HBAR actual cost per HSS execution with SaucerSwap + gasLimit=4M
const ESTIMATED_GAS_PER_EXEC = 280_000_000n;

async function main() {
  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("DCARegistry", PROXY, signer);

  const cur = await registry.estimatedGasPerExec();
  console.log(`Current: ${cur.toString()} (${Number(cur) / 1e8} HBAR)`);

  if (cur !== ESTIMATED_GAS_PER_EXEC) {
    await (await registry.setEstimatedGasPerExec(ESTIMATED_GAS_PER_EXEC)).wait();
    console.log(`Updated to: ${ESTIMATED_GAS_PER_EXEC.toString()} (${Number(ESTIMATED_GAS_PER_EXEC) / 1e8} HBAR)`);
  }
}

main().catch(console.error);
