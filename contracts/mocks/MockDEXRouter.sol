// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IUniswapV2Router02.sol";

contract MockDEXRouter is IUniswapV2Router02 {
    // Exchange rate: rateNumerator / rateDenominator = exchange rate
    uint256 public rateNumerator;
    uint256 public rateDenominator;
    bool public shouldFail;

    constructor(uint256 _rateNumerator, uint256 _rateDenominator) {
        rateNumerator = _rateNumerator;
        rateDenominator = _rateDenominator;
    }

    function setRate(uint256 _num, uint256 _den) external {
        rateNumerator = _num;
        rateDenominator = _den;
    }

    function setShouldFail(bool _fail) external {
        shouldFail = _fail;
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view override returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = (amountIn * rateNumerator) / rateDenominator;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external override returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        require(!shouldFail, "Mock: forced failure");

        uint256 amountOut = (amountIn * rateNumerator) / rateDenominator;
        require(amountOut >= amountOutMin, "Insufficient output amount");

        // Pull tokenIn from sender
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);

        // Send tokenOut to recipient (mock must hold tokenOut balance)
        IERC20(path[path.length - 1]).transfer(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;
    }
}
