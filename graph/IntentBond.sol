// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IntentBond — bonds locked behind living intent validity
/// @notice Funds stay locked while the intent is valid. If GenLayer
///         reports invalidated/expired, the counterparty can claim.
///         If intent drifts, partial release proportional to confidence.
contract IntentBond {
    struct Bond {
        address depositor;
        address beneficiary;
        uint256 amount;
        uint256 intentKey;
        bool settled;
    }

    address public resolver;
    mapping(uint256 => Bond) public bonds;
    uint256 public bondCount;

    event BondCreated(uint256 indexed id, address depositor, address beneficiary, uint256 amount);
    event BondSettled(uint256 indexed id, address recipient, uint256 amount);

    modifier onlyResolver() { require(msg.sender == resolver, "!resolver"); _; }

    constructor(address _resolver) { resolver = _resolver; }

    function createBond(address beneficiary, uint256 intentKey) external payable returns (uint256 id) {
        require(msg.value > 0, "must deposit");
        id = bondCount++;
        bonds[id] = Bond(msg.sender, beneficiary, msg.value, intentKey, false);
        emit BondCreated(id, msg.sender, beneficiary, msg.value);
    }

    /// @notice Intent still valid — return to depositor
    function returnBond(uint256 id) external onlyResolver {
        Bond storage b = bonds[id];
        require(!b.settled, "already settled");
        b.settled = true;
        payable(b.depositor).transfer(b.amount);
        emit BondSettled(id, b.depositor, b.amount);
    }

    /// @notice Intent invalidated — pay beneficiary
    function claimBond(uint256 id) external onlyResolver {
        Bond storage b = bonds[id];
        require(!b.settled, "already settled");
        b.settled = true;
        payable(b.beneficiary).transfer(b.amount);
        emit BondSettled(id, b.beneficiary, b.amount);
    }

    /// @notice Partial — split by confidence (bps)
    function splitBond(uint256 id, uint256 depositorBps) external onlyResolver {
        Bond storage b = bonds[id];
        require(!b.settled, "already settled");
        require(depositorBps <= 10000, "max 10000");
        b.settled = true;
        uint256 toDepositor = (b.amount * depositorBps) / 10000;
        uint256 toBeneficiary = b.amount - toDepositor;
        if (toDepositor > 0) payable(b.depositor).transfer(toDepositor);
        if (toBeneficiary > 0) payable(b.beneficiary).transfer(toBeneficiary);
        emit BondSettled(id, b.depositor, toDepositor);
    }
}
