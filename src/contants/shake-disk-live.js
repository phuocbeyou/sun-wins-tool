export const LIST_RESULTS_DRAGON = ["🔴", "⚪", "🌸", "🔵", "🟡", "🟣", "🟢"]
export const LIST_BET= ["1K","5K","10K","100K","500K","1M","5M","10M","50M"]

export const CMD_START = "1955"
export const CMD_END = "1956"
export const CMD_BET = "1952"

export const CMD_PLUGIN_1 = "1950"
export const CMD_PLUGIN_2 = "1959"

export const BET_OPTIONS_SHAKE_DISK = [
    { label: "Chẵn (1:2)", value: "EVEN", ui: [true] },
    { label: "Lẻ (1:2)", value: "ODD", ui: [false] },
    { label: "Lẻ (1:4)", value: "X3RED", ui: [false, true, true, true] },
    { label: "Lẻ (1:4)", value: "X3WHITE", ui: [true, false, false, false] },
    { label: "Chẵn (1:16)", value: "X4RED", ui: [true, true, true, true] },
    { label: "Chẵn (1:16)", value: "X4WHITE", ui: [false, false, false, false] }
];