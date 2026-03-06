// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockDCAScheduler {
    mapping(address => uint256) public userBalance;
    uint256 public gasLimit;
    bool public shouldFailCancel;
    bool public shouldFailRefund;

    event GasReserved(address indexed user, uint256 amount);
    event GasRefunded(address indexed user, uint256 amount, uint256 actualSent);

    constructor(uint256 _gasLimit) {
        gasLimit = _gasLimit;
    }

    function deposit() external payable {
        userBalance[msg.sender] += msg.value;
    }

    receive() external payable {
        userBalance[msg.sender] += msg.value;
    }

    function reserveGas(address user, uint256 amount) external returns (bool) {
        if (userBalance[user] < amount) return false;
        userBalance[user] -= amount;
        emit GasReserved(user, amount);
        return true;
    }

    function refundGas(address payable user, uint256 amount) external returns (bool success) {
        if (shouldFailRefund) return false;
        uint256 available = address(this).balance;
        uint256 toSend = amount < available ? amount : available;
        if (toSend > 0) {
            (success,) = user.call{value: toSend}("");
        }
        emit GasRefunded(user, amount, toSend);
    }

    function scheduleCall(
        address, uint256, bytes calldata
    ) external pure returns (int64 rc, address scheduleAddr) {
        // Mock: always succeed with a dummy address
        rc = 22;
        scheduleAddr = address(0xDEAD);
    }

    function cancelSchedule(address) external view returns (bool) {
        return !shouldFailCancel;
    }

    function hasCapacity(uint256) external pure returns (bool) {
        return true;
    }

    // Test helpers
    function setShouldFailCancel(bool _fail) external {
        shouldFailCancel = _fail;
    }

    function setShouldFailRefund(bool _fail) external {
        shouldFailRefund = _fail;
    }
}
