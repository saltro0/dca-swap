// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDCAScheduler {
    function scheduleCall(
        address target,
        uint256 executeAt,
        bytes calldata callData
    ) external returns (int64 rc, address scheduleAddr);

    function cancelSchedule(address scheduleAddr) external returns (bool success);  // now returns bool

    function reserveGas(address user, uint256 amount) external returns (bool);
    function refundGas(address payable user, uint256 amount) external returns (bool success);  // now returns bool

    function userBalance(address user) external view returns (uint256);
    function gasLimit() external view returns (uint256);
    function hasCapacity(uint256 timestamp) external view returns (bool);
}
