import { ethers, upgrades } from "hardhat";
import "dotenv/config";

const PROXY = "0xB9aD3787972d41c772ffc752b2c0687a37296731";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading with:", deployer.address);

  const DCARegistry = await ethers.getContractFactory("DCARegistry");
  const upgraded = await upgrades.upgradeProxy(PROXY, DCARegistry);
  await upgraded.waitForDeployment();

  const newImpl = await upgrades.erc1967.getImplementationAddress(PROXY);
  console.log("Proxy:", PROXY);
  console.log("New implementation:", newImpl);
  console.log("Upgrade complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
