// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDCARegistry {
    struct DCAPosition {
        address owner;
        address tokenIn;
        address tokenOut;
        uint256 amountPerSwap;
        uint256 interval;
        uint256 maxExecutions;
        uint256 executionsLeft;
        uint256 executionsDone;
        uint256 tokenInBalance;
        uint256 tokenOutAccum;
        uint256 hbarBalance;
        uint16 slippageBps;
        bool active;
        address currentSchedule;
        // --- New fields (audit fixes) ---
        uint256 lastExecutedAt;       // CRITICAL-1: timing guard
        uint8 consecutiveFailures;    // CRITICAL-2: failure tracking
    }

    event PositionCreated(
        uint256 indexed positionId,
        address indexed owner,
        address tokenIn,
        address tokenOut,
        uint256 amountPerSwap,
        uint256 interval,
        uint256 maxExecutions
    );
    event SwapExecuted(
        uint256 indexed positionId,
        uint256 tokenInSpent,
        uint256 tokenOutReceived,
        uint256 fee,
        uint256 executionsLeft
    );
    event SwapFailed(uint256 indexed positionId, uint256 executionsLeft);
    event PositionStopped(uint256 indexed positionId);
    event PositionDeactivated(uint256 indexed positionId, string reason);
    event Withdrawal(
        uint256 indexed positionId,
        uint256 tokenInReturned,
        uint256 tokenOutReturned,
        uint256 hbarReturned
    );
    event TopUp(
        uint256 indexed positionId,
        uint256 extraTokenIn,
        uint256 extraHbar,
        uint256 newExecutionsLeft
    );
    event ScheduleCancelFailed(uint256 indexed positionId, address scheduleAddr);

    function createPosition(
        address tokenIn,
        address tokenOut,
        uint256 amountPerSwap,
        uint256 interval,
        uint16 slippageBps,
        uint256 tokenInAmount
    ) external returns (uint256 positionId);

    function execute(uint256 positionId) external;
    function stop(uint256 positionId) external;
    function withdraw(uint256 positionId) external;
    function topUp(uint256 positionId, uint256 extraTokenIn, uint256 extraGas) external;

    function getPosition(uint256 positionId) external view returns (DCAPosition memory);
    function getEstimatedExecutions(
        uint256 tokenInAmount,
        uint256 amountPerSwap,
        uint256 hbarAmount
    ) external view returns (uint256);
}
