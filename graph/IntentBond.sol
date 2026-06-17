// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IntentBond — escrow whose release is driven by a MorphoIntent verdict
/// @notice Funds are locked behind a living intent. The settlement DIRECTION
///         (return / claim / split) is decided by the GenLayer MorphoIntent
///         contract's on-chain judgment, read through `read_status` /
///         `preview_settlement`. A dApp (or the bond's own depositor) maps that
///         verdict into the matching call here.
///
///         Two settlement paths are supported:
///           1. On-chain, trustless: the MorphoIntent intelligent contract is
///              registered as `resolver` and settles via an emitted EVM call
///              (see MorphoIntent.settle_bond) — production path.
///           2. Frontend/SDK bridge: the bond's depositor reads the verdict and
///              triggers the matching settlement. Authorisation is restricted to
///              the depositor or the resolver so settlement is never anonymous.
contract IntentBond {
    struct Bond {
        address depositor;
        address beneficiary;
        uint256 amount;
        uint256 intentKey;
        bool settled;
    }

    address public resolver; // MorphoIntent IC (trustless path) or admin
    mapping(uint256 => Bond) public bonds;
    uint256 public bondCount;

    event BondCreated(uint256 indexed id, address depositor, address beneficiary, uint256 amount, uint256 intentKey);
    event BondSettled(uint256 indexed id, string action, address recipient, uint256 amount);

    constructor(address _resolver) { resolver = _resolver; }

    modifier auth(uint256 id) {
        require(msg.sender == bonds[id].depositor || msg.sender == resolver, "!authorized");
        _;
    }

    function createBond(address beneficiary, uint256 intentKey) external payable returns (uint256 id) {
        require(msg.value > 0, "must deposit");
        id = bondCount++;
        bonds[id] = Bond(msg.sender, beneficiary, msg.value, intentKey, false);
        emit BondCreated(id, msg.sender, beneficiary, msg.value, intentKey);
    }

    /// @notice Intent still holds (status active) — return to depositor
    function returnBond(uint256 id) external auth(id) {
        Bond storage b = bonds[id];
        require(!b.settled, "already settled");
        b.settled = true;
        payable(b.depositor).transfer(b.amount);
        emit BondSettled(id, "return", b.depositor, b.amount);
    }

    /// @notice Intent broken (invalidated / expired) — pay beneficiary
    function claimBond(uint256 id) external auth(id) {
        Bond storage b = bonds[id];
        require(!b.settled, "already settled");
        b.settled = true;
        payable(b.beneficiary).transfer(b.amount);
        emit BondSettled(id, "claim", b.beneficiary, b.amount);
    }

    /// @notice Intent weakened — split by confidence (depositorBps in 0..10000)
    function splitBond(uint256 id, uint256 depositorBps) external auth(id) {
        require(depositorBps <= 10000, "max 10000");
        Bond storage b = bonds[id];
        require(!b.settled, "already settled");
        b.settled = true;
        uint256 toDepositor = (b.amount * depositorBps) / 10000;
        uint256 toBeneficiary = b.amount - toDepositor;
        if (toDepositor > 0) payable(b.depositor).transfer(toDepositor);
        if (toBeneficiary > 0) payable(b.beneficiary).transfer(toBeneficiary);
        emit BondSettled(id, "split", b.depositor, toDepositor);
    }
}
