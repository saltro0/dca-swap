// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Minimal HTS precompile interface for creating and minting fungible tokens
interface IHederaTokenService {
    struct HederaToken {
        string name;
        string symbol;
        address treasury;
        string memo;
        bool tokenSupplyType; // false = infinite
        int64 maxSupply;
        bool freezeDefault;
        TokenKey[] tokenKeys;
        Expiry expiry;
    }

    struct TokenKey {
        uint256 keyType; // bit field: 1=admin, 2=kyc, 4=freeze, 8=wipe, 16=supply, 32=fee, 64=pause
        KeyValue key;
    }

    struct KeyValue {
        bool inheritAccountKey;
        address contractId;
        bytes ed25519;
        bytes ECDSA_secp256k1;
        address delegatableContractId;
    }

    struct Expiry {
        int64 second;
        address autoRenewAccount;
        int64 autoRenewPeriod;
    }

    function createFungibleToken(
        HederaToken memory token,
        int64 initialTotalSupply,
        int32 decimals
    ) external payable returns (int64 responseCode, address tokenAddress);

    function mintToken(
        address token,
        int64 amount,
        bytes[] memory metadata
    ) external returns (int64 responseCode, int64 newTotalSupply, int64[] memory serialNumbers);

    function associateToken(
        address account,
        address token
    ) external returns (int64 responseCode);
}

contract HTSTokenFactory {
    address constant HTS = address(0x167);

    address public lastToken;
    address public owner;

    event TokenCreated(address tokenAddress, string name, string symbol);
    event TokenMinted(address tokenAddress, int64 amount);

    constructor() {
        owner = msg.sender;
    }

    // Create a fungible HTS token. Requires HBAR for token creation fee (~1 HBAR).
    function createToken(
        string memory name,
        string memory symbol,
        int32 decimals,
        int64 initialSupply
    ) external payable returns (address tokenAddress) {
        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](1);
        // Supply key = this contract (so we can mint more)
        keys[0] = IHederaTokenService.TokenKey({
            keyType: 16, // supply key
            key: IHederaTokenService.KeyValue({
                inheritAccountKey: false,
                contractId: address(this),
                ed25519: "",
                ECDSA_secp256k1: "",
                delegatableContractId: address(0)
            })
        });

        IHederaTokenService.HederaToken memory token = IHederaTokenService.HederaToken({
            name: name,
            symbol: symbol,
            treasury: address(this),
            memo: "",
            tokenSupplyType: false,
            maxSupply: 0,
            freezeDefault: false,
            tokenKeys: keys,
            expiry: IHederaTokenService.Expiry({
                second: 0,
                autoRenewAccount: address(this),
                autoRenewPeriod: 7776000 // 90 days
            })
        });

        (bool success, bytes memory result) = HTS.call{value: msg.value}(
            abi.encodeWithSelector(
                IHederaTokenService.createFungibleToken.selector,
                token,
                initialSupply,
                decimals
            )
        );

        require(success, "HTS call failed");
        int64 rc;
        (rc, tokenAddress) = abi.decode(result, (int64, address));
        require(rc == 22, "Token creation failed");

        lastToken = tokenAddress;
        emit TokenCreated(tokenAddress, name, symbol);
    }

    // Mint additional tokens (only works if this contract is the supply key)
    function mint(address token, int64 amount) external returns (int64 newSupply) {
        bytes[] memory metadata = new bytes[](0);
        (bool success, bytes memory result) = HTS.call(
            abi.encodeWithSelector(
                IHederaTokenService.mintToken.selector,
                token,
                amount,
                metadata
            )
        );
        require(success, "Mint call failed");
        int64 rc;
        (rc, newSupply,) = abi.decode(result, (int64, int64, int64[]));
        require(rc == 22, "Mint failed");
        emit TokenMinted(token, amount);
    }

    // Transfer tokens from treasury (this contract) to a recipient
    function transfer(address token, address to, uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        // Use ERC20 interface (HIP-218 compatibility)
        (bool success,) = token.call(
            abi.encodeWithSelector(bytes4(keccak256("transfer(address,uint256)")), to, amount)
        );
        require(success, "Transfer failed");
    }

    // Associate a contract/account with the token
    function associateToken(address account, address token) external {
        (bool success, bytes memory result) = HTS.call(
            abi.encodeWithSelector(
                IHederaTokenService.associateToken.selector,
                account,
                token
            )
        );
        if (success && result.length >= 32) {
            int64 rc = abi.decode(result, (int64));
            require(rc == 22 || rc == 282, "Associate failed"); // 282 = already associated
        }
    }

    receive() external payable {}
}
