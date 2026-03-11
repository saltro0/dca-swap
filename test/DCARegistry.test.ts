import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  deployFixture, createTestPosition,
  FEE_BPS, ESTIMATED_GAS, ONE_HOUR, ONE_DAY,
} from "./helpers/setup";

describe("DCARegistry", () => {

  // ==================== Initialization ====================
  describe("Initialization", () => {
    it("should set correct initial values", async () => {
      const { registry, treasury, mockRouter } = await deployFixture();
      expect(await registry.feeBps()).to.equal(FEE_BPS);
      expect(await registry.estimatedGasPerExec()).to.equal(ESTIMATED_GAS);
      expect(await registry.treasury()).to.equal(await treasury.getAddress());
      expect(await registry.dexRouter()).to.equal(await mockRouter.getAddress());
      expect(await registry.nextPositionId()).to.equal(0);
    });

    it("should not allow re-initialization", async () => {
      const { registry, treasury, mockRouter } = await deployFixture();
      await expect(
        registry.initialize(await treasury.getAddress(), await mockRouter.getAddress(), 50, 1000)
      ).to.be.reverted;
    });
  });

  // ==================== Admin ====================
  describe("Admin", () => {
    it("should allow owner to set feeBps", async () => {
      const { registry } = await deployFixture();
      await registry.setFeeBps(100);
      expect(await registry.feeBps()).to.equal(100);
    });

    it("should reject feeBps > 500", async () => {
      const { registry } = await deployFixture();
      await expect(registry.setFeeBps(501)).to.be.revertedWith("Fee too high");
    });

    it("should reject non-owner admin calls", async () => {
      const { registry, user1 } = await deployFixture();
      await expect(registry.connect(user1).setFeeBps(100)).to.be.reverted;
    });

    it("should allow owner to pause/unpause", async () => {
      const { registry } = await deployFixture();
      await registry.pause();
      expect(await registry.paused()).to.be.true;
      await registry.unpause();
      expect(await registry.paused()).to.be.false;
    });
  });

  // ==================== createPosition ====================
  describe("createPosition", () => {
    it("should create a position with correct values", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);

      const pos = await fixture.registry.getPosition(0);
      expect(pos.owner).to.equal(await fixture.user1.getAddress());
      expect(pos.active).to.be.true;
      expect(pos.executionsDone).to.equal(0);
      expect(pos.tokenInBalance).to.equal(ethers.parseUnits("500", 6));
      expect(pos.consecutiveFailures).to.equal(0);
      expect(pos.lastExecutedAt).to.be.gt(0);
    });

    it("should emit PositionCreated event", async () => {
      const fixture = await deployFixture();
      const { registry, tokenIn, tokenOut, mockScheduler, user1 } = fixture;
      const deposit = ethers.parseUnits("500", 6);

      await mockScheduler.connect(user1).deposit({ value: ethers.parseEther("5") });
      await tokenIn.connect(user1).approve(await registry.getAddress(), deposit);

      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), await tokenOut.getAddress(),
          ethers.parseUnits("100", 6), ONE_HOUR, 50, deposit
        )
      ).to.emit(registry, "PositionCreated");
    });

    it("should revert if amountPerSwap is 0", async () => {
      const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), await tokenOut.getAddress(),
          0, ONE_DAY, 50, ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("amountPerSwap must be > 0");
    });

    it("should revert if deposit < amountPerSwap", async () => {
      const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), await tokenOut.getAddress(),
          ethers.parseUnits("200", 6), ONE_DAY, 50, ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("deposit < amountPerSwap");
    });

    it("should revert if deposit < minimum (1 USD)", async () => {
      const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
      const tiny = ethers.parseUnits("0.5", 6);
      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), await tokenOut.getAddress(),
          tiny, ONE_DAY, 50, tiny
        )
      ).to.be.revertedWith("deposit < minimum (1 USD)");
    });

    // MED-1: Same token validation
    it("should revert if tokenIn == tokenOut", async () => {
      const { registry, tokenIn, user1 } = await deployFixture();
      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), await tokenIn.getAddress(),
          ethers.parseUnits("100", 6), ONE_DAY, 50, ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("Same token");
    });

    // MED-2: Contract address validation
    it("should revert if tokenIn is not a contract", async () => {
      const { registry, tokenOut, user1 } = await deployFixture();
      const fakeAddr = "0x0000000000000000000000000000000000000001";
      await expect(
        registry.connect(user1).createPosition(
          fakeAddr, await tokenOut.getAddress(),
          ethers.parseUnits("100", 6), ONE_DAY, 50, ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("tokenIn not a contract");
    });

    it("should revert if tokenOut is not a contract", async () => {
      const { registry, tokenIn, user1 } = await deployFixture();
      const fakeAddr = "0x0000000000000000000000000000000000000001";
      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), fakeAddr,
          ethers.parseUnits("100", 6), ONE_DAY, 50, ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("tokenOut not a contract");
    });

    it("should transfer tokenIn from user to contract", async () => {
      const fixture = await deployFixture();
      const { tokenIn, user1 } = fixture;
      const balBefore = await tokenIn.balanceOf(await user1.getAddress());
      await createTestPosition(fixture);
      const balAfter = await tokenIn.balanceOf(await user1.getAddress());
      expect(balBefore - balAfter).to.equal(ethers.parseUnits("500", 6));
    });

    it("should revert if insufficient gas deposit in scheduler", async () => {
      const { registry, tokenIn, tokenOut, user1 } = await deployFixture();
      // Don't deposit HBAR to scheduler
      const deposit = ethers.parseUnits("500", 6);
      await tokenIn.connect(user1).approve(await registry.getAddress(), deposit);
      await expect(
        registry.connect(user1).createPosition(
          await tokenIn.getAddress(), await tokenOut.getAddress(),
          ethers.parseUnits("100", 6), ONE_DAY, 50, deposit
        )
      ).to.be.revertedWith("Insufficient gas deposit in scheduler");
    });
  });

  // ==================== execute ====================
  describe("execute", () => {
    it("should execute swap and update position", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);

      await time.increase(ONE_DAY);

      await fixture.registry.execute(0);
      const pos = await fixture.registry.getPosition(0);
      expect(pos.executionsDone).to.equal(1);
      expect(pos.tokenInBalance).to.equal(ethers.parseUnits("400", 6));
      expect(pos.tokenOutAccum).to.be.gt(0);
      expect(pos.consecutiveFailures).to.equal(0);
    });

    it("should send fee to treasury", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      const treasuryAddr = await fixture.treasury.getAddress();
      const balBefore = await fixture.tokenIn.balanceOf(treasuryAddr);

      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);

      const balAfter = await fixture.tokenIn.balanceOf(treasuryAddr);
      expect(balAfter - balBefore).to.equal(ethers.parseUnits("0.5", 6));
    });

    it("should emit SwapExecuted event", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await time.increase(ONE_DAY);
      await expect(fixture.registry.execute(0)).to.emit(fixture.registry, "SwapExecuted");
    });

    it("should deactivate when executionsLeft hits 0", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture, {
        deposit: ethers.parseUnits("100", 6),
        amountPerSwap: ethers.parseUnits("100", 6),
        hbarDeposit: ethers.parseEther("0.5"),
      });

      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);

      const pos = await fixture.registry.getPosition(0);
      expect(pos.active).to.be.false;
    });

    it("should revert on inactive position", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture, {
        deposit: ethers.parseUnits("100", 6),
        amountPerSwap: ethers.parseUnits("100", 6),
        hbarDeposit: ethers.parseEther("0.5"),
      });
      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);
      await expect(fixture.registry.execute(0)).to.be.revertedWith("Position not active");
    });

    // CRITICAL-1: Timing guard
    it("should revert if called too early (CRITICAL-1)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      // Don't advance time — should fail
      await expect(fixture.registry.execute(0)).to.be.revertedWith("Too early");
    });

    it("should allow execution after interval has passed (CRITICAL-1)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await time.increase(ONE_DAY);
      await expect(fixture.registry.execute(0)).to.not.be.reverted;
    });

    // CRITICAL-2: Gas not deducted on failure
    it("should NOT deduct gas on swap failure (CRITICAL-2)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);

      // Make router fail
      await fixture.mockRouter.setShouldFail(true);
      const posBefore = await fixture.registry.getPosition(0);

      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);

      const posAfter = await fixture.registry.getPosition(0);
      // Gas should NOT have been deducted
      expect(posAfter.hbarBalance).to.equal(posBefore.hbarBalance);
      // But consecutiveFailures should increment
      expect(posAfter.consecutiveFailures).to.equal(1);
    });

    it("should deactivate after MAX_CONSECUTIVE_FAILURES (CRITICAL-2)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);

      // Make swaps fail
      await fixture.mockRouter.setShouldFail(true);

      // Execute 5 times (MAX_CONSECUTIVE_FAILURES = 5)
      for (let i = 0; i < 5; i++) {
        await time.increase(ONE_DAY);
        await fixture.registry.execute(0);
      }

      const pos = await fixture.registry.getPosition(0);
      expect(pos.active).to.be.false;
    });

    it("should reset consecutiveFailures on success (CRITICAL-2)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);

      // Fail once
      await fixture.mockRouter.setShouldFail(true);
      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);
      expect((await fixture.registry.getPosition(0)).consecutiveFailures).to.equal(1);

      // Succeed
      await fixture.mockRouter.setShouldFail(false);
      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);
      expect((await fixture.registry.getPosition(0)).consecutiveFailures).to.equal(0);
    });
  });

  // ==================== stop ====================
  describe("stop", () => {
    it("should set active=false", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await fixture.registry.connect(fixture.user1).stop(0);
      expect((await fixture.registry.getPosition(0)).active).to.be.false;
    });

    it("should emit PositionStopped", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await expect(fixture.registry.connect(fixture.user1).stop(0))
        .to.emit(fixture.registry, "PositionStopped");
    });

    it("should revert if not owner", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await expect(fixture.registry.connect(fixture.user2).stop(0))
        .to.be.revertedWith("Not owner");
    });

    it("should revert if already stopped", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await fixture.registry.connect(fixture.user1).stop(0);
      await expect(fixture.registry.connect(fixture.user1).stop(0))
        .to.be.revertedWith("Already stopped");
    });
  });

  // ==================== withdraw ====================
  describe("withdraw", () => {
    it("should return unused tokenIn to owner", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      const userAddr = await fixture.user1.getAddress();

      // Execute once
      await time.increase(ONE_DAY);
      await fixture.registry.execute(0);

      const tokenInBefore = await fixture.tokenIn.balanceOf(userAddr);
      await fixture.registry.connect(fixture.user1).withdraw(0);
      const tokenInAfter = await fixture.tokenIn.balanceOf(userAddr);
      expect(tokenInAfter - tokenInBefore).to.equal(ethers.parseUnits("400", 6));
    });

    it("should emit Withdrawal event", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await expect(fixture.registry.connect(fixture.user1).withdraw(0))
        .to.emit(fixture.registry, "Withdrawal");
    });

    it("should revert if not owner", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await expect(fixture.registry.connect(fixture.user2).withdraw(0))
        .to.be.revertedWith("Not owner");
    });

    // PERF-5: Storage cleanup
    it("should delete position from storage after withdraw (PERF-5)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await fixture.registry.connect(fixture.user1).withdraw(0);
      const pos = await fixture.registry.getPosition(0);
      expect(pos.owner).to.equal(ethers.ZeroAddress);
      expect(pos.tokenInBalance).to.equal(0);
    });
  });

  // ==================== topUp ====================
  describe("topUp", () => {
    it("should add more tokenIn and recalculate executions", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      const { registry, tokenIn, mockScheduler, user1 } = fixture;

      const extra = ethers.parseUnits("500", 6);
      await mockScheduler.connect(user1).deposit({ value: ethers.parseEther("5") });
      await tokenIn.connect(user1).approve(await registry.getAddress(), extra);
      await registry.connect(user1).topUp(0, extra, ethers.parseEther("5"));

      const pos = await registry.getPosition(0);
      expect(pos.tokenInBalance).to.equal(ethers.parseUnits("1000", 6));
    });

    it("should emit TopUp event", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      const { registry, tokenIn, user1 } = fixture;

      const extra = ethers.parseUnits("100", 6);
      await tokenIn.connect(user1).approve(await registry.getAddress(), extra);
      await expect(registry.connect(user1).topUp(0, extra, 0))
        .to.emit(registry, "TopUp");
    });

    it("should revert if not owner", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await expect(fixture.registry.connect(fixture.user2).topUp(0, 0, 0))
        .to.be.revertedWith("Not owner");
    });

    it("should revert if position not active", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      await fixture.registry.connect(fixture.user1).stop(0);
      await expect(fixture.registry.connect(fixture.user1).topUp(0, 0, 0))
        .to.be.revertedWith("Position not active");
    });

    // MED-4: Correct recalculation
    it("should calculate executionsLeft from current balances (MED-4)", async () => {
      const fixture = await deployFixture();
      await createTestPosition(fixture);
      const { registry, tokenIn, mockScheduler, user1 } = fixture;

      // Execute 2 times
      await time.increase(ONE_DAY);
      await registry.execute(0);
      await time.increase(ONE_DAY);
      await registry.execute(0);

      // Top up 300 USDC
      const extra = ethers.parseUnits("300", 6);
      await mockScheduler.connect(user1).deposit({ value: ethers.parseEther("3") });
      await tokenIn.connect(user1).approve(await registry.getAddress(), extra);
      await registry.connect(user1).topUp(0, extra, ethers.parseEther("3"));

      const pos = await registry.getPosition(0);
      // executionsLeft should be based on current balances, not historical
      expect(pos.executionsLeft).to.be.gt(0);
      expect(pos.maxExecutions).to.equal(pos.executionsDone + pos.executionsLeft);
    });
  });

  // ==================== View ====================
  describe("View", () => {
    it("should estimate executions correctly", async () => {
      const { registry } = await deployFixture();
      const est = await registry.getEstimatedExecutions(
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("100", 6),
        ethers.parseEther("5")
      );
      expect(est).to.equal(10);
    });

    it("should return min of token and gas limits", async () => {
      const { registry } = await deployFixture();
      const est = await registry.getEstimatedExecutions(
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("100", 6),
        ethers.parseEther("2")
      );
      expect(est).to.equal(4);
    });
  });
});
