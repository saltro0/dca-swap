// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library DCALib {
    uint16 constant MAX_FEE_BPS = 500;
    uint256 constant MIN_INTERVAL = 60;
    uint256 constant MIN_DEPOSIT = 1e6; // 1 USD (USDC has 6 decimals)
    uint8 constant MAX_CONSECUTIVE_FAILURES = 5;  // CRITICAL-2

    function calculateFee(
        uint256 amount,
        uint16 feeBps
    ) internal pure returns (uint256) {
        return (amount * feeBps) / 10000;
    }

    function calculateMaxExecutions(
        uint256 tokenInAmount,
        uint256 amountPerSwap,
        uint256 hbarAmount,
        uint256 estimatedGasPerExec
    ) internal pure returns (uint256) {
        uint256 maxByToken = tokenInAmount / amountPerSwap;
        uint256 maxByGas = estimatedGasPerExec > 0
            ? hbarAmount / estimatedGasPerExec
            : type(uint256).max;
        return maxByToken < maxByGas ? maxByToken : maxByGas;
    }

    function validateCreateParams(
        address tokenIn,      // MED-1, MED-2
        address tokenOut,     // MED-1, MED-2
        uint256 amountPerSwap,
        uint256 interval,
        uint256 tokenInAmount,
        uint16 slippageBps
    ) internal view {         // changed from pure to view (for code.length check)
        require(tokenIn != tokenOut, "Same token");                          // MED-1
        require(tokenIn.code.length > 0, "tokenIn not a contract");         // MED-2
        require(tokenOut.code.length > 0, "tokenOut not a contract");       // MED-2
        require(amountPerSwap > 0, "amountPerSwap must be > 0");
        require(interval >= MIN_INTERVAL, "interval too short");
        require(tokenInAmount >= MIN_DEPOSIT, "deposit < minimum (1 USD)");
        require(tokenInAmount >= amountPerSwap, "deposit < amountPerSwap");
        require(slippageBps <= 5000, "slippage > 50%");
    }
}
