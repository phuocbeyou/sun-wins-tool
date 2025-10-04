export const LIST_RESULTS_DRAGON = ["🔴", "⚪", "🌸", "🔵", "🟡", "🟣", "🟢"]
export const LIST_BET= ["1K","5K","10K","100K","500K","1M","5M","10M","50M"]

export const CMD_START = "904"
export const CMD_END = "908"
export const CMD_END_BET = "908"
export const CMD_BET = "900"
export const CMD_BUDGET = "100"

export const CMD_JACKPOT = "207"

export const CMD_PLUGIN_1 = "1950"
export const CMD_PLUGIN_2 = "1959"

export const BET_OPTIONS = [
    { label: "Chẵn (1:2)", value: "2", res: true },
    { label: "Lẻ (1:2)", value: "5", res: false },
    { label: "1 Trắng 3 Đỏ (1:4)", value: "1", res: false },
    { label: "1 Đỏ 3 Trắng (1:4)", value: "3", res: false },
    { label: "4 Đỏ (1:16)", value: "0", res: true },
    { label: "4 Trắng (1:16)", value: "4", res: true }
];