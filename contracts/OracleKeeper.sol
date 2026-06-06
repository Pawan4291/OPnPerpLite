// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract OracleKeeper {
    address public keeper;
    address public owner;

    uint256 public currentPrice;
    uint256 public lastUpdated;

    uint256 public constant PRICE_HISTORY_SIZE = 50;
    uint256[50] public priceHistory;
    uint256[50] public priceTimestamps;
    uint256 public historyIndex;
    uint256 public historyCount;

    event PriceUpdated(uint256 price, uint256 timestamp);
    event KeeperUpdated(address newKeeper);

    modifier onlyKeeper() {
        require(msg.sender == keeper || msg.sender == owner, "Not authorized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(uint256 _initialPrice) {
        owner = msg.sender;
        keeper = msg.sender;
        currentPrice = _initialPrice;
        lastUpdated = block.timestamp;
        priceHistory[0] = _initialPrice;
        priceTimestamps[0] = block.timestamp;
        historyIndex = 1;
        historyCount = 1;
    }

    function setPrice(uint256 _price) external onlyKeeper {
        require(_price > 0, "Price must be > 0");
        currentPrice = _price;
        lastUpdated = block.timestamp;

        priceHistory[historyIndex] = _price;
        priceTimestamps[historyIndex] = block.timestamp;
        historyIndex = (historyIndex + 1) % PRICE_HISTORY_SIZE;
        if (historyCount < PRICE_HISTORY_SIZE) historyCount++;

        emit PriceUpdated(_price, block.timestamp);
    }

    function getPrice() external view returns (uint256) {
        require(currentPrice > 0, "Price not set");
        return currentPrice;
    }

    function getPriceHistory() external view returns (uint256[50] memory prices, uint256[50] memory timestamps, uint256 count) {
        return (priceHistory, priceTimestamps, historyCount);
    }

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    function isPriceStale() external view returns (bool) {
        return block.timestamp - lastUpdated > 5 minutes;
    }
}
