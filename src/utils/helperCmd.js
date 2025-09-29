import chalk from 'chalk';
import stringWidth from "string-width"

export function logSuccess(text) {
  console.log(chalk.green(text));
}

export function logError(text) {
  console.log(chalk.red(text));
}

export function logInfo(text) {
  console.log(chalk.blue(text));
}

export function printTable(data, options = {}) {
  const keyWidth = options.keyWidth || 20
  const valueWidth = options.valueWidth || 20

  const pad = (value, length) => {
    if (value === undefined || value === null) return " ".repeat(length)
    return String(value).padEnd(length, " ")
  }

  const colorKey = options.colorKey || chalk.cyan
  const colorValue = options.colorValue || chalk.greenBright

  // Header
  console.log(chalk.bold.cyan(`┌${"─".repeat(keyWidth)}┬${"─".repeat(valueWidth)}┐`))
  console.log(chalk.bold.cyan(`│ ${pad("Thông tin", keyWidth - 1)}│ ${pad("Giá trị", valueWidth - 1)}│`))
  console.log(chalk.bold.cyan(`├${"─".repeat(keyWidth)}┼${"─".repeat(valueWidth)}┤`))

  // Dữ liệu
  for (const [key, value] of Object.entries(data)) {
    const line =
      colorKey(`│ ${pad(key, keyWidth - 1)}`) +
      colorValue(pad(value, valueWidth)) +
      colorKey("│")
    console.log(line)
  }

  // Footer
  console.log(chalk.bold.cyan(`└${"─".repeat(keyWidth)}┴${"─".repeat(valueWidth)}┘`))
}