// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IOracleKeeper {
    function getPrice() external view returns (uint256);
    function isPriceStale() external view returns (bool);
}

interface ILiquidityVault {
    function reserveLiquidity(uint256 amount) external;
    function releaseLiquidity(uint256 amount) external;
    function payoutProfit(address trader, uint256 profit) external;
    function receiveLoss(uint256 loss) external payable;
    function getVaultBalance() external view returns (uint256, uint256, uint256);
}

contract PerpEngine {
    address public owner;
    IOracleKeeper public oracle;
    ILiquidityVault public vault;

    uint256 public nextPositionId;
    uint256 public constant PRECISION = 1e18;
    uint256 public constant LIQUIDATION_BONUS_BPS = 500; // 5%
    uint256 public constant MIN_COLLATERAL = 0.001 ether;
    uint256 public constant MAX_LEVERAGE = 10;

    struct Position {
        address trader;
        uint256 collateral;
        uint8 leverage;
        uint256 positionSize;
        uint256 entryPrice;
        uint256 liquidationPrice;
        bool isLong;
        bool isOpen;
        uint256 openedAt;
    }

    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) public traderPositions;

    // Leaderboard tracking
    mapping(address => int256) public realizedPnL;
    address[] public traders;
    mapping(address => bool) public isTrader;

    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        bool isLong,
        uint256 collateral,
        uint8 leverage,
        uint256 entryPrice,
        uint256 liquidationPrice,
        uint256 positionSize
    );

    event PositionClosed(
        uint256 indexed positionId,
        address indexed trader,
        uint256 exitPrice,
        int256 pnl,
        uint256 collateralReturned
    );

    event Liquidated(
        uint256 indexed positionId,
        address indexed trader,
        address indexed liquidator,
        uint256 price,
        uint256 liquidatorBonus
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _oracle, address _vault) {
        owner = msg.sender;
        oracle = IOracleKeeper(_oracle);
        vault = ILiquidityVault(_vault);
    }

    function openLong(uint8 _leverage) external payable {
        _openPosition(_leverage, true);
    }

    function openShort(uint8 _leverage) external payable {
        _openPosition(_leverage, false);
    }

    function _openPosition(uint8 _leverage, bool _isLong) internal {
        require(!oracle.isPriceStale(), "Price is stale");
        require(msg.value >= MIN_COLLATERAL, "Collateral too low");
        require(_leverage >= 2 && _leverage <= MAX_LEVERAGE, "Invalid leverage");

        uint256 entryPrice = oracle.getPrice();
        uint256 positionSize = msg.value * _leverage;

        // Reserve enough liquidity to pay potential profits
        uint256 maxPayout = positionSize;
        vault.reserveLiquidity(maxPayout);

        // Calculate liquidation price
        // For LONG: price drops by (1/leverage) of entry → liquidated
        // For SHORT: price rises by (1/leverage) of entry → liquidated
        uint256 liquidationPrice;
        if (_isLong) {
            liquidationPrice = entryPrice - (entryPrice / _leverage);
        } else {
            liquidationPrice = entryPrice + (entryPrice / _leverage);
        }

        uint256 positionId = nextPositionId++;
        positions[positionId] = Position({
            trader: msg.sender,
            collateral: msg.value,
            leverage: _leverage,
            positionSize: positionSize,
            entryPrice: entryPrice,
            liquidationPrice: liquidationPrice,
            isLong: _isLong,
            isOpen: true,
            openedAt: block.timestamp
        });

        traderPositions[msg.sender].push(positionId);

        if (!isTrader[msg.sender]) {
            isTrader[msg.sender] = true;
            traders.push(msg.sender);
        }

        emit PositionOpened(
            positionId,
            msg.sender,
            _isLong,
            msg.value,
            _leverage,
            entryPrice,
            liquidationPrice,
            positionSize
        );
    }

    function closePosition(uint256 _positionId) external {
        Position storage pos = positions[_positionId];
        require(pos.isOpen, "Position not open");
        require(pos.trader == msg.sender, "Not your position");
        require(!oracle.isPriceStale(), "Price is stale");

        uint256 exitPrice = oracle.getPrice();
        int256 pnl = _calculatePnL(pos, exitPrice);

        pos.isOpen = false;
        vault.releaseLiquidity(pos.positionSize);

        uint256 collateralReturned;
        if (pnl >= 0) {
            uint256 profit = uint256(pnl);
            collateralReturned = pos.collateral + profit;
            vault.payoutProfit(msg.sender, profit);
            (bool success, ) = payable(msg.sender).call{value: pos.collateral}("");
            require(success, "Collateral return failed");
        } else {
            uint256 loss = uint256(-pnl);
            if (loss >= pos.collateral) {
                collateralReturned = 0;
                vault.receiveLoss{value: pos.collateral}(pos.collateral);
            } else {
                collateralReturned = pos.collateral - loss;
                vault.receiveLoss{value: loss}(loss);
                (bool success, ) = payable(msg.sender).call{value: collateralReturned}("");
                require(success, "Return failed");
            }
        }

        realizedPnL[msg.sender] += pnl;

        emit PositionClosed(_positionId, msg.sender, exitPrice, pnl, collateralReturned);
    }

    function liquidate(uint256 _positionId) external {
        Position storage pos = positions[_positionId];
        require(pos.isOpen, "Position not open");

        uint256 currentPrice = oracle.getPrice();
        bool isLiquidatable;

        if (pos.isLong) {
            isLiquidatable = currentPrice <= pos.liquidationPrice;
        } else {
            isLiquidatable = currentPrice >= pos.liquidationPrice;
        }

        require(isLiquidatable, "Not liquidatable");

        pos.isOpen = false;
        vault.releaseLiquidity(pos.positionSize);

        uint256 bonus = (pos.collateral * LIQUIDATION_BONUS_BPS) / 10000;
        uint256 vaultAmount = pos.collateral - bonus;

        vault.receiveLoss{value: vaultAmount}(vaultAmount);
        (bool success, ) = payable(msg.sender).call{value: bonus}("");
        require(success, "Bonus transfer failed");

        realizedPnL[pos.trader] -= int256(pos.collateral);

        emit Liquidated(_positionId, pos.trader, msg.sender, currentPrice, bonus);
    }

    function _calculatePnL(Position storage pos, uint256 exitPrice) internal view returns (int256) {
        int256 priceDelta;
        if (pos.isLong) {
            priceDelta = int256(exitPrice) - int256(pos.entryPrice);
        } else {
            priceDelta = int256(pos.entryPrice) - int256(exitPrice);
        }
        // PnL = (priceDelta / entryPrice) * positionSize
        return (priceDelta * int256(pos.positionSize)) / int256(pos.entryPrice);
    }

    function getHealthFactor(uint256 _positionId) external view returns (uint256) {
        Position storage pos = positions[_positionId];
        if (!pos.isOpen) return 0;

        uint256 currentPrice = oracle.getPrice();
        uint256 health;

        if (pos.isLong) {
            if (currentPrice <= pos.liquidationPrice) return 0;
            health = ((currentPrice - pos.liquidationPrice) * 100) / (pos.entryPrice - pos.liquidationPrice);
        } else {
            if (currentPrice >= pos.liquidationPrice) return 0;
            health = ((pos.liquidationPrice - currentPrice) * 100) / (pos.liquidationPrice - pos.entryPrice);
        }

        return health > 100 ? 100 : health;
    }

    function getPosition(uint256 _positionId) external view returns (Position memory) {
        return positions[_positionId];
    }

    function getTraderPositions(address _trader) external view returns (uint256[] memory) {
        return traderPositions[_trader];
    }

    function getLeaderboard() external view returns (address[] memory, int256[] memory) {
        uint256 len = traders.length;
        int256[] memory pnls = new int256[](len);
        for (uint256 i = 0; i < len; i++) {
            pnls[i] = realizedPnL[traders[i]];
        }
        return (traders, pnls);
    }

    function isLiquidatable(uint256 _positionId) external view returns (bool) {
        Position storage pos = positions[_positionId];
        if (!pos.isOpen) return false;
        uint256 currentPrice = oracle.getPrice();
        if (pos.isLong) return currentPrice <= pos.liquidationPrice;
        return currentPrice >= pos.liquidationPrice;
    }

    function getOpenPositionPnL(uint256 _positionId) external view returns (int256) {
        Position storage pos = positions[_positionId];
        if (!pos.isOpen) return 0;
        uint256 currentPrice = oracle.getPrice();
        return _calculatePnL(pos, currentPrice);
    }
}
