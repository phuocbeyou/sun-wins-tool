import { LIST_BET } from "../contants/sunrong.js";

export function mapBetStringToNumber(betString) {
    if (typeof betString !== 'string' || betString.length === 0) {
      return null;
    }
  
    const item = betString.trim().toUpperCase();
    const unit = item.slice(-1);
    let numericPart;
  
    if (unit === 'K' || unit === 'M') {
      numericPart = parseFloat(item.slice(0, -1));
    } else {
      numericPart = parseFloat(item);
    }
  
    if (isNaN(numericPart)) {
      return null;
    }
  
    if (unit === 'K') {
      return numericPart * 1000;
    } else if (unit === 'M') {
      return numericPart * 1000000;
    } else {
      return numericPart;
    }
}

const REVERSE_MAP = new Map();

const DENOMINATIONS = LIST_BET
  .map(betString => {
    const numericValue = mapBetStringToNumber(betString);
    if (numericValue !== null) {
      REVERSE_MAP.set(numericValue, betString); 
      return numericValue;
    }
    return 0;
  })
  .filter(value => value > 0)
  .sort((a, b) => b - a);

export function decomposeBet(totalBetAmount) {
    let remainingAmount = totalBetAmount;
    const resultNumericBets = [];

    for (const denomination of DENOMINATIONS) { 
      while (remainingAmount >= denomination) {
        resultNumericBets.push(denomination);
        remainingAmount -= denomination;
      }
      if (remainingAmount === 0) {
        break;
      }
    }
    
    return resultNumericBets;
}

export const convertVnd = (number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0
    }).format(number);
  };
  
  export function expandBets(choices, amounts) {
    const expanded = []
  
    choices.forEach((choice, index) => {
      const targetAmount = amounts[index] ?? 0
      const parts = decomposeBet(targetAmount)
      parts.forEach(part => {
        expanded.push({ choice, amount: part })
      })
    })
  
    return expanded
  }