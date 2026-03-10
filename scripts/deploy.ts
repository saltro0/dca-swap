import { ethers, upgrades } from "hardhat";
import "dotenv/config";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  const dexRouter = process.env.SAUCERSWAP_ROUTER_TESTNET || "0x0000000000000000000000000000000000004b40";
  const feeBps = parseInt(process.env.FEE_BPS || "50");
  // ~2.8 HBAR per HSS execution with SaucerSwap (verified on testnet with gasLimit=4M)
  // Hedera EVM: 1 HBAR = 1e8 tinybars
  const estimatedGas = BigInt(process.env.ESTIMATED_GAS_PER_EXEC || "280000000");

  const DCARegistry = await ethers.getContractFactory("DCARegistry");
  const proxy = await upgrades.deployProxy(
    DCARegistry,
    [treasury, dexRouter, feeBps, estimatedGas],
    { kind: "uups" }
  );

  await proxy.waitForDeployment();
  const proxyAddr = await proxy.getAddress();
  const implAddr = await upgrades.erc1967.getImplementationAddress(proxyAddr);

  console.log("Proxy deployed to:", proxyAddr);
  console.log("Implementation:", implAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
