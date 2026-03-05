// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// IHRC1215 — HIP-1215 Schedule Service precompile interface
// Address on Hedera: 0x16b (system contract)
// Based on: https://github.com/hashgraph/hedera-smart-contracts
interface IScheduleService {
    function scheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes memory callData
    ) external returns (int64 responseCode, address scheduleAddress);

    function authorizeSchedule(
        address scheduleAddress
    ) external returns (int64 responseCode);

    function deleteSchedule(
        address scheduleAddress
    ) external returns (int64 responseCode);

    function hasScheduleCapacity(
        uint256 expirySecond,
        uint256 gasLimit
    ) external view returns (bool hasCapacity);
}
