import { ethers, upgrades } from "hardhat";
import "dotenv/config";

async function main() {
  const proxyAddress = process.env.DCA_REGISTRY_PROXY_ADDRESS;
  if (!proxyAddress) throw new Error("DCA_REGISTRY_PROXY_ADDRESS required");

  const DCARegistryV2 = await ethers.getContractFactory("DCARegistry");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, DCARegistryV2);

  await upgraded.waitForDeployment();
  const implAddr = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("Upgraded. New implementation:", implAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
