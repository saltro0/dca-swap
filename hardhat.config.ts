import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    hederaTestnet: {
      url: "https://testnet.hashio.io/api",
      accounts: process.env.HEDERA_OPERATOR_KEY
        ? [process.env.HEDERA_OPERATOR_KEY]
        : [],
      chainId: 296,
    },
    hederaMainnet: {
      url: "https://mainnet.hashio.io/api",
      accounts: process.env.HEDERA_OPERATOR_KEY
        ? [process.env.HEDERA_OPERATOR_KEY]
        : [],
      chainId: 295,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
