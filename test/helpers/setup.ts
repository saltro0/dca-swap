import { ethers, upgrades } from "hardhat";
import { DCARegistry, MockDEXRouter, MockERC20, MockDCAScheduler } from "../../typechain-types";

export const FEE_BPS = 50;
export const ESTIMATED_GAS = ethers.parseEther("0.5");
export const ONE_HOUR = 3600;
export const ONE_DAY = 86400;
export const MOCK_GAS_LIMIT = 1_000_000;

export async function deployFixture() {
  const [owner, user1, user2, treasury] = await ethers.getSigners();

  // Deploy mock tokens
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const tokenIn = (await upgrades.deployProxy(MockERC20Factory, [
    "USD Coin", "USDC", 6,
  ])) as unknown as MockERC20;
  const tokenOut = (await upgrades.deployProxy(MockERC20Factory, [
    "Wrapped HBAR", "WHBAR", 8,
  ])) as unknown as MockERC20;

  // Deploy mock DEX router
  const MockDEXFactory = await ethers.getContractFactory("MockDEXRouter");
  const mockRouter = await MockDEXFactory.deploy(1000, 1);

  // Fund router with tokenOut
  await tokenOut.mint(await mockRouter.getAddress(), ethers.parseUnits("1000000", 8));

  // Deploy DCARegistry via UUPS proxy
  const DCARegistryFactory = await ethers.getContractFactory("DCARegistry");
  const registry = (await upgrades.deployProxy(
    DCARegistryFactory,
    [await treasury.getAddress(), await mockRouter.getAddress(), FEE_BPS, ESTIMATED_GAS],
    { kind: "uups" }
  )) as unknown as DCARegistry;

  // Deploy MockDCAScheduler
  const MockSchedulerFactory = await ethers.getContractFactory("MockDCAScheduler");
  const mockScheduler = (await MockSchedulerFactory.deploy(MOCK_GAS_LIMIT)) as unknown as MockDCAScheduler;

  // Configure scheduling
  await registry.setScheduler(await mockScheduler.getAddress());
  await registry.setSchedulingEnabled(true);

  // Mint tokens for users
  await tokenIn.mint(await user1.getAddress(), ethers.parseUnits("10000", 6));
  await tokenIn.mint(await user2.getAddress(), ethers.parseUnits("10000", 6));

  return {
    registry, tokenIn, tokenOut, mockRouter, mockScheduler,
    owner, user1, user2, treasury,
  };
}

/**
 * Helper: deposit HBAR to scheduler for a user, then create a standard position.
 * Returns positionId.
 */
export async function createTestPosition(
  fixture: Awaited<ReturnType<typeof deployFixture>>,
  options?: {
    deposit?: bigint;
    amountPerSwap?: bigint;
    interval?: number;
    slippageBps?: number;
    hbarDeposit?: bigint;
  }
) {
  const { registry, tokenIn, tokenOut, mockScheduler, user1 } = fixture;
  const deposit = options?.deposit ?? ethers.parseUnits("500", 6);
  const amountPerSwap = options?.amountPerSwap ?? ethers.parseUnits("100", 6);
  const interval = options?.interval ?? ONE_DAY;
  const slippageBps = options?.slippageBps ?? 50;
  const hbarDeposit = options?.hbarDeposit ?? ethers.parseEther("5");

  // User deposits HBAR to scheduler for gas
  await mockScheduler.connect(user1).deposit({ value: hbarDeposit });

  // Approve and create position
  await tokenIn.connect(user1).approve(await registry.getAddress(), deposit);
  await registry.connect(user1).createPosition(
    await tokenIn.getAddress(),
    await tokenOut.getAddress(),
    amountPerSwap,
    interval,
    slippageBps,
    deposit
  );

  return 0; // First position ID is always 0
}
