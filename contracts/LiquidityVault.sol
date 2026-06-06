// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LiquidityVault {
    address public owner;
    address public perpEngine;

    uint256 public totalLiquidity;
    uint256 public reservedLiquidity;

    mapping(address => uint256) public lpShares;
    uint256 public totalShares;

    event Deposited(address indexed lp, uint256 amount, uint256 shares);
    event Withdrawn(address indexed lp, uint256 amount, uint256 shares);
    event LiquidityReserved(uint256 amount);
    event LiquidityReleased(uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyPerpEngine() {
        require(msg.sender == perpEngine, "Not PerpEngine");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setPerpEngine(address _perpEngine) external onlyOwner {
        perpEngine = _perpEngine;
    }

    function deposit() external payable {
        require(msg.value > 0, "Must deposit > 0");

        uint256 shares;
        if (totalShares == 0 || totalLiquidity == 0) {
            shares = msg.value;
        } else {
            shares = (msg.value * totalShares) / totalLiquidity;
        }

        lpShares[msg.sender] += shares;
        totalShares += shares;
        totalLiquidity += msg.value;

        emit Deposited(msg.sender, msg.value, shares);
    }

    function withdraw(uint256 _shares) external {
        require(lpShares[msg.sender] >= _shares, "Insufficient shares");
        require(totalShares > 0, "No shares");

        uint256 amount = (_shares * totalLiquidity) / totalShares;
        uint256 available = totalLiquidity - reservedLiquidity;
        require(amount <= available, "Insufficient available liquidity");

        lpShares[msg.sender] -= _shares;
        totalShares -= _shares;
        totalLiquidity -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(msg.sender, amount, _shares);
    }

    function reserveLiquidity(uint256 _amount) external onlyPerpEngine {
        require(totalLiquidity - reservedLiquidity >= _amount, "Insufficient liquidity");
        reservedLiquidity += _amount;
        emit LiquidityReserved(_amount);
    }

    function releaseLiquidity(uint256 _amount) external onlyPerpEngine {
        if (_amount > reservedLiquidity) {
            reservedLiquidity = 0;
        } else {
            reservedLiquidity -= _amount;
        }
        emit LiquidityReleased(_amount);
    }

    function payoutProfit(address _trader, uint256 _profit) external onlyPerpEngine {
        require(_profit <= totalLiquidity, "Insufficient vault funds");
        totalLiquidity -= _profit;
        (bool success, ) = payable(_trader).call{value: _profit}("");
        require(success, "Payout failed");
    }

    function receiveLoss(uint256 _loss) external payable onlyPerpEngine {
        totalLiquidity += _loss;
    }

    function getVaultBalance() external view returns (uint256 total, uint256 reserved, uint256 available) {
        return (totalLiquidity, reservedLiquidity, totalLiquidity - reservedLiquidity);
    }

    function getLPShare(address _lp) external view returns (uint256 shares, uint256 value) {
        if (totalShares == 0) return (0, 0);
        shares = lpShares[_lp];
        value = (shares * totalLiquidity) / totalShares;
    }

    receive() external payable {
        totalLiquidity += msg.value;
    }
}
