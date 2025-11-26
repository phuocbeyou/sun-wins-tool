import { BET_OPTIONS_BARACAT } from "../contants/bracat.js";
import { BET_OPTIONS_FISH } from "../contants/fish-prawn-carb.js";
import { BET_OPTIONS_SHAKE_DISK } from "../contants/shake-disk-live.js";
import { BET_OPTIONS } from "../contants/shake-disk.js";
import { LIST_BET } from "../contants/sunrong.js";
import { printTable } from "./helperCmd.js";

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

/**
 * Cắt lấy 20 phần tử cuối cùng của mảng, sau đó ánh xạ các chữ số trong mỗi phần tử 
 * sang các nhãn tương ứng (HƯƠU, BẦU, GÀ, CÁ, CUA, TÔM).
 * * Định dạng đầu ra: Các nhãn được nối với nhau bằng dấu gạch ngang (ví dụ: TÔM-HƯƠU-BẦU).
 * * @param {string[]} data - Mảng các chuỗi chứa các số cách nhau bởi dấu phẩy (ví dụ: '4,4,1').
 * @returns {string[]} Mảng các chuỗi đã được ánh xạ (ví dụ: 'CUA-CUA-BẦU').
 */
export function mapLast20Results(data) {
  // Công thức ánh xạ:
  const MAPPING = {
      "0": "HƯU",
      "1": "BẦU",
      "2": "GÀ",
      "3": "CÁ",
      "4": "CUA",
      "5": "TÔM"
  };

  // 1. Cắt mảng lấy 20 phần tử cuối cùng
  const last20 = data.slice(-52);

  // 2. Ánh xạ các chữ số sang các nhãn
  const mappedResults = last20.map(item => {
      // Chia chuỗi thành các số (dưới dạng chuỗi)
      const digits = item.split(',');
      
      // Ánh xạ từng chữ số
      const labels = digits.map(digit => {
          return MAPPING[digit] || digit;
      });
      
      // Nối các nhãn lại với nhau bằng DẤU GẠCH NGANG (-)
      return labels.join('-');
  });

  return mappedResults;
}

const MAPPING = {
  "0": "HƯU",
  "1": "BẦU",
  "2": "GÀ",
  "3": "CÁ",
  "4": "CUA",
  "5": "TÔM"
};

const REVERSE = Object.fromEntries(
  Object.entries(MAPPING).map(([k, v]) => [v, Number(k)])
);


export function analyzeAnimals(list) {
  const counts = {};
  const lastIndex = {};
  let idx = 0;

  list.forEach(item => {
    const parts = item.split("-");
    parts.forEach(p => {
      counts[p] = (counts[p] || 0) + 1;
      lastIndex[p] = idx++;
    });
  });

  const sorted = Object.keys(counts)
    .map(name => ({
      choice: REVERSE[name],
      amount: 10000,
      count: counts[name],
      last: lastIndex[name]
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.last - a.last;
    });

  return sorted.slice(0, 4);
}

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

  export function getLabelByValue(value) {
    const option = BET_OPTIONS.find(opt => opt.value == value);
    return option ? option.label : "Không xác định";
  }

  export function getLabelByRes(value) {
    const option = BET_OPTIONS.find(opt => opt.value == value);
    return option?.res ? "CHẴN" : "LẺ"
  }

  export function printBetResult(result) {
    const { choices, amounts, ruleName } = result;
  
    // Map choices sang label
    const choiceLabels = choices.map(c => getLabelByValue(c));
  
    // Sum amounts
    const totalAmount = amounts.reduce((a, b) => a + b, 0);
  
    printTable({"Ô cược": choiceLabels.join(", "),"Tổng cược": totalAmount, "Rule cược":ruleName })
  }

  
  // FISH PRAWN CARB
  export function getLabelByValueFish(value) {
    const option = BET_OPTIONS_FISH.find(opt => String(opt.value) === String(value));
    return option ? option.label.toUpperCase() : "KHÔNG XÁC ĐỊNH";
  }

  export function getLabelByResFish(value) {
    const option = BET_OPTIONS_FISH.find(opt => opt.value == value);
    return option?.res ? "CHẴN" : "LẺ"
  }

  // baracat
  export function getLabelByValueBaracat(value) {
    const option = BET_OPTIONS_BARACAT.find(opt => opt.value == value);
    return option?.label
  }

  export function printBetResultBaracat(result) {
    const { choices, amounts, ruleName } = result;
  
    // Map choices sang label
    const choiceLabels = choices.map(c => getLabelByValueBaracat(c));
  
    // Sum amounts
    const totalAmount = amounts.reduce((a, b) => a + b, 0);
  
    printTable({"Ô cược": choiceLabels.join(", "),"Tổng cược": totalAmount, "Rule cược":ruleName })
  }

  // shake disk live
  
  export function printBetResultShakeDiskLive(result) {
    const { choices, amounts, ruleName } = result;
  
    // Map choices sang label
    const choiceLabels = choices.map(c => getLabelByValueShakeDiskLive(c));
  
    // Sum amounts
    const totalAmount = amounts.reduce((a, b) => a + b, 0);
  
    printTable({"Ô cược": choiceLabels.join(", "),"Tổng cược": totalAmount, "Rule cược":ruleName })
  }
  export function getLabelByValueShakeDiskLive(value) {
    const option = BET_OPTIONS_SHAKE_DISK.find(opt => opt.value == value);
    return option ? option.label : "Không xác định";
  }