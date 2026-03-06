// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IDCARegistry.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IDCAScheduler.sol";
import "./libraries/DCALib.sol";

contract DCARegistry is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient,
    IDCARegistry
{
    using SafeERC20 for IERC20;

    // --- Storage ---
    mapping(uint256 => DCAPosition) private _positions;
    uint256 public nextPositionId;

    uint16 public feeBps;
    uint256 public estimatedGasPerExec;
    address public treasury;
    address public dexRouter;

    mapping(address => bool) public associatedTokens;

    bool public schedulingEnabled;
    address public scheduler; // DCAScheduler contract (non-proxy, for HSS calls)

    // HSS gasLimit: SaucerSwap swap uses ~2.9M gas, re-scheduling needs ~1M more.
    // 4M verified on testnet for full execute + _scheduleNext cycle with SaucerSwap.
    uint256 constant RECOMMENDED_HSS_GAS_LIMIT = 4_000_000;

    // --- Initializer ---
    function initialize(
        address _treasury,
        address _dexRouter,
        uint16 _feeBps,
        uint256 _estimatedGasPerExec
    ) public initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();

        require(_treasury != address(0), "Invalid treasury");
        require(_dexRouter != address(0), "Invalid router");
        require(_feeBps <= DCALib.MAX_FEE_BPS, "Fee too high");

        treasury = _treasury;
        dexRouter = _dexRouter;
        feeBps = _feeBps;
        estimatedGasPerExec = _estimatedGasPerExec;
    }

    // --- UUPS ---
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // --- Admin ---
    function setFeeBps(uint16 _feeBps) external onlyOwner {
        require(_feeBps <= DCALib.MAX_FEE_BPS, "Fee too high");
        feeBps = _feeBps;
    }

    function setEstimatedGasPerExec(uint256 _val) external onlyOwner {
        estimatedGasPerExec = _val;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    function setDexRouter(address _dexRouter) external onlyOwner {
        require(_dexRouter != address(0), "Invalid router");
        dexRouter = _dexRouter;
    }

    function setSchedulingEnabled(bool _enabled) external onlyOwner {
        schedulingEnabled = _enabled;
    }

    function setScheduler(address _scheduler) external onlyOwner {
        require(_scheduler != address(0), "Invalid scheduler");
        scheduler = _scheduler;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Rescue HBAR stuck in the proxy (from old payable createPosition calls)
    function rescueHBAR(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "Transfer failed");
    }

    // --- View ---
    function getPosition(uint256 positionId) external view returns (DCAPosition memory) {
        return _positions[positionId];
    }

    function getEstimatedExecutions(
        uint256 tokenInAmount,
        uint256 amountPerSwap,
        uint256 hbarAmount
    ) external view returns (uint256) {
        return DCALib.calculateMaxExecutions(
            tokenInAmount, amountPerSwap, hbarAmount, estimatedGasPerExec
        );
    }

    // --- createPosition ---
    // Gas is reserved from user's deposit in DCAScheduler (no msg.value needed)
    function createPosition(
        address tokenIn,
        address tokenOut,
        uint256 amountPerSwap,
        uint256 interval,
        uint16 slippageBps,
        uint256 tokenInAmount
    ) external whenNotPaused nonReentrant returns (uint256) {
        DCALib.validateCreateParams(tokenIn, tokenOut, amountPerSwap, interval, tokenInAmount, slippageBps);

        uint256 maxByToken = tokenInAmount / amountPerSwap;
        uint256 gasNeeded = maxByToken * estimatedGasPerExec;

        if (schedulingEnabled && estimatedGasPerExec > 0 && scheduler != address(0)) {
            require(
                IDCAScheduler(scheduler).reserveGas(msg.sender, gasNeeded),
                "Insufficient gas deposit in scheduler"
            );
        }

        uint256 maxExec = DCALib.calculateMaxExecutions(
            tokenInAmount, amountPerSwap, gasNeeded, estimatedGasPerExec
        );
        require(maxExec > 0, "Insufficient funds for 1 execution");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), tokenInAmount);

        uint256 positionId = nextPositionId++;
        _positions[positionId] = DCAPosition({
            owner: msg.sender,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountPerSwap: amountPerSwap,
            interval: interval,
            maxExecutions: maxExec,
            executionsLeft: maxExec,
            executionsDone: 0,
            tokenInBalance: tokenInAmount,
            tokenOutAccum: 0,
            hbarBalance: gasNeeded,
            slippageBps: slippageBps,
            active: true,
            currentSchedule: address(0),
            lastExecutedAt: block.timestamp,    // CRITICAL-1
            consecutiveFailures: 0              // CRITICAL-2
        });

        emit PositionCreated(
            positionId, msg.sender, tokenIn, tokenOut,
            amountPerSwap, interval, maxExec
        );

        if (schedulingEnabled) {
            _scheduleNext(positionId);
        }
        return positionId;
    }

    // --- execute ---
    function execute(uint256 positionId) external whenNotPaused nonReentrant {
        DCAPosition storage pos = _positions[positionId];
        require(pos.active, "Position not active");
        require(pos.executionsLeft > 0, "No executions left");
        require(pos.tokenInBalance >= pos.amountPerSwap, "Insufficient tokenIn");

        // CRITICAL-1: Timing guard — prevent early execution
        require(
            block.timestamp >= pos.lastExecutedAt + pos.interval,
            "Too early"
        );

        uint256 feeAmount = DCALib.calculateFee(pos.amountPerSwap, feeBps);
        uint256 netAmount = pos.amountPerSwap - feeAmount;

        try this._executeSwapExternal(pos.tokenIn, pos.tokenOut, netAmount, pos.slippageBps, pos.owner)
            returns (uint256 amountOut)
        {
            if (feeAmount > 0) {
                IERC20(pos.tokenIn).safeTransfer(treasury, feeAmount);
            }

            pos.tokenOutAccum += amountOut;
            pos.tokenInBalance -= pos.amountPerSwap;
            pos.executionsLeft--;
            pos.executionsDone++;
            pos.lastExecutedAt = block.timestamp;   // CRITICAL-1: update timestamp
            pos.consecutiveFailures = 0;            // CRITICAL-2: reset on success

            // CRITICAL-2: Deduct gas ONLY on successful swap
            if (pos.hbarBalance >= estimatedGasPerExec) {
                pos.hbarBalance -= estimatedGasPerExec;
            }

            emit SwapExecuted(positionId, pos.amountPerSwap, amountOut, feeAmount, pos.executionsLeft);
        } catch {
            // CRITICAL-2: Don't deduct gas on failure, track consecutive failures
            pos.consecutiveFailures++;
            emit SwapFailed(positionId, pos.executionsLeft);

            if (pos.consecutiveFailures >= DCALib.MAX_CONSECUTIVE_FAILURES) {
                pos.active = false;
                emit PositionDeactivated(positionId, "too many consecutive failures");
                return;
            }
        }

        // Schedule next or deactivate
        if (pos.executionsLeft == 0) {
            pos.active = false;
            emit PositionDeactivated(positionId, "executions exhausted");
        } else if (pos.hbarBalance < estimatedGasPerExec) {
            pos.active = false;
            emit PositionDeactivated(positionId, "insufficient gas");
        } else if (schedulingEnabled) {
            _scheduleNext(positionId);
        }
    }

    // External wrapper for try/catch (Solidity requires external call for try/catch)
    function _executeSwapExternal(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint16 slippageBps,
        address recipient
    ) external returns (uint256) {
        require(msg.sender == address(this), "Only self");
        return _executeSwap(tokenIn, tokenOut, amountIn, slippageBps, recipient);
    }

    // MED-5: use forceApprove and reset approval after swap
    function _executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint16 slippageBps,
        address recipient
    ) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        IERC20(tokenIn).forceApprove(dexRouter, amountIn);   // MED-5: use forceApprove

        uint256[] memory amountsOut = IUniswapV2Router02(dexRouter).getAmountsOut(amountIn, path);
        uint256 amountOutMin = (amountsOut[1] * (10000 - slippageBps)) / 10000;

        uint256[] memory results = IUniswapV2Router02(dexRouter).swapExactTokensForTokens(
            amountIn, amountOutMin, path, recipient, block.timestamp + 300
        );

        IERC20(tokenIn).forceApprove(dexRouter, 0);           // MED-5: reset approval

        return results[results.length - 1];
    }

    // --- stop ---
    function stop(uint256 positionId) external whenNotPaused nonReentrant {
        DCAPosition storage pos = _positions[positionId];
        require(pos.owner == msg.sender, "Not owner");
        require(pos.active, "Already stopped");

        pos.active = false;

        if (schedulingEnabled) {
            _cancelSchedule(positionId, pos.currentSchedule);
            pos.currentSchedule = address(0);
        }

        emit PositionStopped(positionId);
    }

    // --- withdraw ---
    function withdraw(uint256 positionId) external whenNotPaused nonReentrant {
        DCAPosition storage pos = _positions[positionId];
        require(pos.owner == msg.sender, "Not owner");

        if (pos.active) {
            pos.active = false;
            if (schedulingEnabled) {
                _cancelSchedule(positionId, pos.currentSchedule);
                pos.currentSchedule = address(0);
            }
        }

        uint256 tokenInReturn = pos.tokenInBalance;
        uint256 hbarReturn = pos.hbarBalance;

        pos.tokenInBalance = 0;
        pos.hbarBalance = 0;

        if (tokenInReturn > 0) {
            IERC20(pos.tokenIn).safeTransfer(msg.sender, tokenInReturn);
        }
        // HIGH-2: Don't let HBAR refund failure block token withdrawal
        if (hbarReturn > 0 && scheduler != address(0)) {
            try IDCAScheduler(scheduler).refundGas(payable(msg.sender), hbarReturn) {
            } catch {
                // Refund failed — user can claim from scheduler directly
            }
        }

        // PERF-5: Clean up storage for withdrawn positions
        uint256 tokenOutAccum = pos.tokenOutAccum;
        delete _positions[positionId];

        emit Withdrawal(positionId, tokenInReturn, tokenOutAccum, hbarReturn);
    }

    // --- topUp ---
    // MED-4: Calculate executionsLeft directly from current balances
    function topUp(
        uint256 positionId,
        uint256 extraTokenIn,
        uint256 extraGas
    ) external whenNotPaused nonReentrant {
        DCAPosition storage pos = _positions[positionId];
        require(pos.owner == msg.sender, "Not owner");
        require(pos.active, "Position not active");

        if (extraTokenIn > 0) {
            IERC20(pos.tokenIn).safeTransferFrom(msg.sender, address(this), extraTokenIn);
            pos.tokenInBalance += extraTokenIn;
        }

        if (extraGas > 0 && scheduler != address(0)) {
            require(
                IDCAScheduler(scheduler).reserveGas(msg.sender, extraGas),
                "Insufficient gas deposit"
            );
            pos.hbarBalance += extraGas;
        }

        // MED-4: Calculate executionsLeft directly from current balances
        pos.executionsLeft = DCALib.calculateMaxExecutions(
            pos.tokenInBalance, pos.amountPerSwap, pos.hbarBalance, estimatedGasPerExec
        );
        pos.maxExecutions = pos.executionsDone + pos.executionsLeft;

        emit TopUp(positionId, extraTokenIn, extraGas, pos.executionsLeft);
    }

    // --- Scheduling (HIP-1215 via external DCAScheduler) ---
    function _scheduleNext(uint256 positionId) internal {
        if (scheduler == address(0)) {
            return;
        }

        DCAPosition storage pos = _positions[positionId];
        bytes memory callData = abi.encodeWithSelector(this.execute.selector, positionId);

        // PERF-3: Add jitter to distribute scheduling load (0-29 seconds)
        uint256 jitter = uint256(keccak256(abi.encode(positionId, block.timestamp))) % 30;
        uint256 executeAt = block.timestamp + pos.interval + jitter;

        (bool success, bytes memory result) = scheduler.call(
            abi.encodeWithSelector(
                IDCAScheduler.scheduleCall.selector,
                address(this),
                executeAt,
                callData
            )
        );

        if (success && result.length >= 64) {
            (int64 rc, address scheduleAddr) = abi.decode(result, (int64, address));
            if (rc == 22) {
                pos.currentSchedule = scheduleAddr;
                return;
            }
        }

        pos.active = false;
        emit PositionDeactivated(positionId, "scheduling failed");
    }

    // CRITICAL-3: Check return value, emit event on failure
    function _cancelSchedule(uint256 positionId, address scheduleAddr) internal {
        if (scheduler != address(0) && scheduleAddr != address(0)) {
            (bool success, ) = scheduler.call(
                abi.encodeWithSelector(
                    IDCAScheduler.cancelSchedule.selector,
                    scheduleAddr
                )
            );
            if (!success) {
                emit ScheduleCancelFailed(positionId, scheduleAddr);
            }
        }
    }
}
