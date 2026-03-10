import pkg from "hardhat";
const { ethers } = pkg;
import "dotenv/config";

const PROXY = "0xB9aD3787972d41c772ffc752b2c0687a37296731";
const SCHEDULER = "0x40cDb75F58D968D97A2FCBa233Ae0eA23Fb759BC";

// Verified on testnet: ~1 HBAR actual cost per HSS execution with gasLimit=3M
const ESTIMATED_GAS_PER_EXEC = 100_000_000n; // 1 HBAR = 1e8 tinybars

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const registry = await ethers.getContractAt("DCARegistry", PROXY, signer);
  const scheduler = await ethers.getContractAt(
    ["function gasLimit() view returns (uint256)",
     "function setGasLimit(uint256)"],
    SCHEDULER, signer
  );

  // Update estimatedGasPerExec
  const curGas = await registry.estimatedGasPerExec();
  console.log(`Current estimatedGasPerExec: ${curGas.toString()} tinybars (${Number(curGas) / 1e8} HBAR)`);
  if (curGas !== ESTIMATED_GAS_PER_EXEC) {
    await (await registry.setEstimatedGasPerExec(ESTIMATED_GAS_PER_EXEC)).wait();
    console.log(`Updated to: ${ESTIMATED_GAS_PER_EXEC.toString()} tinybars (${Number(ESTIMATED_GAS_PER_EXEC) / 1e8} HBAR)`);
  }

  // Verify gasLimit
  const gasLimit = await scheduler.gasLimit();
  console.log(`\nScheduler gasLimit: ${gasLimit.toString()}`);

  console.log("\n=== Final config ===");
  console.log(`estimatedGasPerExec: ${(await registry.estimatedGasPerExec()).toString()} (${Number(await registry.estimatedGasPerExec()) / 1e8} HBAR)`);
  console.log(`scheduler: ${await registry.scheduler()}`);
  console.log(`schedulingEnabled: ${await registry.schedulingEnabled()}`);
  console.log(`feeBps: ${await registry.feeBps()}`);
  console.log(`dexRouter: ${await registry.dexRouter()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
