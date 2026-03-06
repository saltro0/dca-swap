// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IScheduleService.sol";

contract DCAScheduler {
    address constant HSS = address(0x16b);

    address public owner;
    address public registry;
    uint256 public gasLimit;

    mapping(address => uint256) public userBalance;

    event Scheduled(address target, uint256 executeAt, address scheduleAddr, int64 rc);
    event ScheduleFailed(string reason);
    event Deposited(address indexed user, uint256 amount);
    event GasReserved(address indexed user, uint256 amount);
    event GasRefunded(address indexed user, uint256 amount, uint256 actualSent);
    event BalanceWithdrawn(address indexed user, uint256 requested, uint256 actualSent);

    modifier onlyOwnerOrRegistry() {
        require(msg.sender == owner || msg.sender == registry, "Not authorized");
        _;
    }

    constructor(address _registry, uint256 _gasLimit) {
        owner = msg.sender;
        registry = _registry;
        gasLimit = _gasLimit;
    }

    function setRegistry(address _registry) external {
        require(msg.sender == owner, "Not owner");
        registry = _registry;
    }

    function setGasLimit(uint256 _gasLimit) external {
        require(msg.sender == owner, "Not owner");
        require(_gasLimit >= 2_000_000, "Gas limit too low (min 2M for swap + reschedule)");
        gasLimit = _gasLimit;
    }

    function deposit() external payable {
        userBalance[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    receive() external payable {
        userBalance[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function reserveGas(address user, uint256 amount) external onlyOwnerOrRegistry returns (bool) {
        if (userBalance[user] < amount) return false;
        userBalance[user] -= amount;
        emit GasReserved(user, amount);
        return true;
    }

    // HIGH-2: Returns bool instead of reverting — never blocks withdraw
    function refundGas(address payable user, uint256 amount) external onlyOwnerOrRegistry returns (bool success) {
        uint256 available = address(this).balance;
        uint256 toSend = amount < available ? amount : available;
        if (toSend > 0) {
            (success,) = user.call{value: toSend}("");
            // Don't revert — just return false so DCARegistry.withdraw can proceed
        }
        emit GasRefunded(user, amount, toSend);
    }

    // HIGH-3: Only deduct what was actually sent
    function withdrawBalance() external {
        uint256 amount = userBalance[msg.sender];
        require(amount > 0, "No balance");

        uint256 available = address(this).balance;
        uint256 toSend = amount < available ? amount : available;
        userBalance[msg.sender] -= toSend;  // FIX: only deduct what's actually sent

        if (toSend > 0) {
            (bool sent,) = payable(msg.sender).call{value: toSend}("");
            if (!sent) {
                userBalance[msg.sender] += toSend;  // Restore on failure
                revert("Transfer failed");
            }
        }
        emit BalanceWithdrawn(msg.sender, amount, toSend);
    }

    function scheduleCall(
        address target,
        uint256 executeAt,
        bytes calldata callData
    ) external onlyOwnerOrRegistry returns (int64 rc, address scheduleAddr) {
        (bool success, bytes memory result) = HSS.call(
            abi.encodeWithSelector(
                IScheduleService.scheduleCall.selector,
                target,
                executeAt,
                gasLimit,
                uint64(0),
                callData
            )
        );

        if (success && result.length >= 64) {
            (rc, scheduleAddr) = abi.decode(result, (int64, address));
            emit Scheduled(target, executeAt, scheduleAddr, rc);
        } else {
            rc = -1;
            emit ScheduleFailed("HSS call failed");
        }
    }

    // Now returns bool for CRITICAL-3 handling
    function cancelSchedule(address scheduleAddr) external onlyOwnerOrRegistry returns (bool success) {
        if (scheduleAddr != address(0)) {
            (success,) = HSS.call(
                abi.encodeWithSelector(
                    IScheduleService.deleteSchedule.selector,
                    scheduleAddr
                )
            );
        }
    }

    function hasCapacity(uint256 timestamp) external view returns (bool) {
        (bool ok, bytes memory res) = HSS.staticcall(
            abi.encodeWithSelector(
                IScheduleService.hasScheduleCapacity.selector,
                timestamp,
                gasLimit
            )
        );
        if (ok && res.length >= 32) {
            return abi.decode(res, (bool));
        }
        return true;
    }
}
