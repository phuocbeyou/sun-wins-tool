import chalk from "chalk"
import websocket from "websocket"
import fs from "fs"
import { fileURLToPath } from "url"
import { dirname } from "path"
import path from "path"
import { readUsers } from "../utils/dataManager.js"
import { sendTelegramAlert } from "../utils/botHelper.js"
import { convertVnd, expandBets } from "../utils/betHelper.js"
import { logError, printTable } from "../utils/helperCmd.js"
import { CMD_BET, CMD_END, CMD_START } from "../contants/sunrong.js"

const WebSocketClient = websocket.client
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const configPath = path.resolve(__dirname, "../config/dragon-hunt.json")

/*------- CONFIG MANAGEMENT FUNCTIONS --------------------*/
let config
let DEFAULT_BET_AMOUNT
let JACKPOT_THRESHOLD
let BET_STOP
let TIME_SEND_MESS
let IS_MARTINGALE
let RATE_MARTINGALE
let ZOMBIE_MODE
let configReloadTimeout

/**
 * Load configuration from rule.json file
 */
function loadConfig() {
  try {
    const newConfig = JSON.parse(fs.readFileSync(configPath, "utf8"))
    config = newConfig
    DEFAULT_BET_AMOUNT = config.gameSettings.BET_AMOUNT
    JACKPOT_THRESHOLD = config.gameSettings.JACKPOT_THRESHOLD
    BET_STOP = config.gameSettings.BET_STOP
    TIME_SEND_MESS = config.gameSettings.TIME_SEND_MESS
    IS_MARTINGALE = config.gameSettings.IS_MARTINGALE
    RATE_MARTINGALE = config.gameSettings.RATE_MARTINGALE
    ZOMBIE_MODE = config.gameSettings.ZOMBIE || false

    logMessage(chalk.green(`[${getCurrentTime()}] Cấu hình rule.json đã được tải lại.`))
    logMessage(chalk.yellow(`Chế độ Martingale: ${IS_MARTINGALE ? "BẬT" : "TẮT"}`))
    logMessage(chalk.yellow(`Chế độ Zombie: ${ZOMBIE_MODE ? "BẬT" : "TẮT"}`))

    if (IS_MARTINGALE) {
      logMessage(chalk.yellow(`Tỷ lệ gấp thếp: ${RATE_MARTINGALE}`))
    }
  } catch (error) {
    console.error(chalk.red(`Lỗi khi đọc hoặc phân tích cú pháp rule.json: ${error.message}`))
  }
}

/**
 * Initialize config watcher
 */
function initConfigWatcher() {
  fs.watch(configPath, (eventType, filename) => {
    if (filename) {
      logMessage(chalk.yellow(`[${getCurrentTime()}] Phát hiện thay đổi trong rule.json (${eventType}). Đang tải lại...`))
      clearTimeout(configReloadTimeout)
      configReloadTimeout = setTimeout(() => {
        loadConfig()
        if (activeGameWorker) {
          activeGameWorker.resetMartingaleState()
        }
      }, 300)
    }
  })
}

/*------- UTILITY FUNCTIONS --------------------*/
/**
 * Log message to console and file
 * @param {string} message 
 */
function logMessage(message) {
  console.log(message)
  try {
    fs.appendFile("./game.log", message.replace(/ \[\d+m/gm, "") + "\n", () => { })
  } catch (error) {
    fs.appendFile("./game.log", message + "\n", () => { })
  }
}

/**
 * Get current time string
 * @returns {string}
 */
function getCurrentTime() {
  return new Date().toLocaleTimeString()
}

function getRandomBettingDelay(min = 5000, max = 12000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Check if budget is sufficient for betting
 * @param {number} currentBudget 
 * @param {number} betAmount 
 * @returns {object}
 */
function checkBudgetSufficiency(currentBudget, betAmount) {
  console.log(currentBudget, betAmount, 'checkBudgetSufficiency')
  if (currentBudget === null) return { sufficient: true }

  const notEnoughToPlay = currentBudget <= BET_STOP
  const notEnoughToBet = betAmount > currentBudget

  return {
    sufficient: !notEnoughToPlay && !notEnoughToBet,
    reason: notEnoughToPlay
      ? "Cảnh báo ví tiền không đủ để cược (dưới ngưỡng dừng cược)"
      : notEnoughToBet
        ? "Cảnh báo ví tiền không đủ để đặt cược (không đủ tiền cho ván này)"
        : null
  }
}

/**
 * Send budget warning alert
 * @param {string} reason 
 * @param {number} currentBudget 
 * @param {number} betAmount 
 * @param {number} lastBetAmount 
 */
function sendBudgetWarning(reason, currentBudget, betAmount, lastBetAmount) {
  sendTelegramAlert({
    type: "warning",
    title: reason,
    content: "Xin hãy vào để kiểm tra lại ví tiền hoặc điều chỉnh mức cược.",
    metadata: {
      wallet: `Số tiền hiện tại: ${convertVnd(currentBudget)}`,
      betAmount: `Số tiền muốn cược: ${convertVnd(betAmount)}`,
      betStop: `Ngưỡng dừng cược: ${convertVnd(BET_STOP)}`,
      rateMartingale: `${lastBetAmount / RATE_MARTINGALE} số thếp đang gấp`,
    },
  })
}

/*------- GAME LOGIC FUNCTIONS --------------------*/
/**
 * Determine betting choices based on rules and history
 * @param {Array} gameHistory 
 * @param {object} config 
 * @returns {object}
 */
function determineBettingChoice(gameHistory, config) {
  const recentHistory = [...gameHistory].reverse()
  const activeRules = config.bettingRules
    .filter((rule) => rule.active)
    .sort((a, b) => b.priority - a.priority)

  for (const rule of activeRules) {
    // Rule mặc định (pattern rỗng)
    if (!rule.pattern || rule.pattern.length === 0) {
      return {
        choices: rule.betOn,
        amounts: rule.betAmount?.length ? rule.betAmount : [config.gameSettings.BET_AMOUNT],
        ruleName: rule.description,
      }
    }

    // Rule có pattern
    if (recentHistory.length >= rule.pattern.length) {
      const historySlice = recentHistory.slice(0, rule.pattern.length)
      const reversedPattern = [...rule.pattern].reverse()
      const patternMatches = reversedPattern.every(
        (val, index) => val === historySlice[index],
      )

      if (patternMatches) {
        return {
          choices: rule.betOn,
          amounts: rule.betAmount?.length ? rule.betAmount : [config.gameSettings.BET_AMOUNT],
          ruleName: rule.description,
        }
      }
    }
  }

  return { choices: [], amounts: [], ruleName: null }
}

/**
 * Calculate martingale bet amounts
 * @param {boolean} wonLastBet 
 * @param {number} baseBetAmount 
 * @param {number} currentMartingaleBet 
 * @param {number} lastBetAmount 
 * @returns {number}
 */
function calculateMartingaleBet(wonLastBet, baseBetAmount, currentMartingaleBet, lastBetAmount) {
  if (!IS_MARTINGALE) return baseBetAmount

  if (wonLastBet) {
    return baseBetAmount // Reset to base amounts
  } else {
    return Math.ceil(lastBetAmount * RATE_MARTINGALE) // Increase bet
  }
}

/**
 * Process game result and update martingale state
 * @param {string} resultType 
 * @param {string} lastBetChoice 
 * @param {number} sessionId 
 * @returns {boolean} - true if won, false if lost
 */
function processGameResult(resultType, lastBetChoice, sessionId) {
  if (!lastBetChoice) return false

  const won = lastBetChoice === resultType
  const resultMessage = won ? "THẮNG! Reset cược gấp thếp." : "THUA! Tăng cược gấp thếp."
  const color = won ? chalk.green : chalk.red

  logMessage(color(`[${getCurrentTime()}] Phiên #${sessionId}: ${resultMessage}`))
  return won
}

/*------- WEBSOCKET MESSAGE HANDLERS --------------------*/
/**
 * Handle main game messages
 * @param {object} msg 
 * @param {GameWorker} worker 
 */
function handleMainGameMessage(msg, worker) {
  if (msg.type !== "utf8") {
    logMessage(chalk.yellow(`Nhận tin nhắn không phải UTF8: ${msg.type}. Bỏ qua.`))
    return
  }

  const messageString = msg.utf8Data
  let parsedMessage

  try {
    parsedMessage = JSON.parse(messageString)
  } catch (e) {
    logMessage(
      chalk.red(
        `Lỗi phân tích tin nhắn (JSON không hợp lệ): ${messageString.substring(0, 100)}... Lỗi: ${e.message}`,
      ),
    )
    return
  }

  // Command 1955: start game
  if (messageString.includes(`"cmd":${CMD_START}`)) {
    handleInitialGameState(parsedMessage, worker)
  }
  // Command 1956: Game result update
  else if (messageString.includes(`"cmd":${CMD_END}`)) {
    handleGameResultUpdate(parsedMessage, worker)
  }
  // Command 1952: Bet confirmation
  else if (messageString.includes(`"cmd":${CMD_BET}`)) {
    handleBetConfirmation(worker)
  }
}

/**
 * Handle initial game state
 * @param {object} parsedMessage 
 * @param {GameWorker} worker 
 */
function handleInitialGameState(parsedMessage, worker) {
  const sessionId = parsedMessage[1]?.sid || "N/A"
  const jackpot = convertVnd(parsedMessage[1]?.jackpotAmount) || "N/A"
  printTable({
    "Phiên": sessionId,
    "Jackpot": jackpot
  })

  worker.currentSessionId = sessionId || null
  worker.currentJackpot = jackpot || 0

  if (worker.currentJackpot < JACKPOT_THRESHOLD) {
    logMessage(chalk.red("Giá trị hũ dưới ngưỡng dừng. Bỏ cược"))
  }
  handleNewGameSession(parsedMessage, worker)
  // Reset Martingale state on new session
  // worker.resetMartingaleState()
}

/**
 * Handle game result update
 * @param {object} parsedMessage 
 * @param {GameWorker} worker 
 */
function handleGameResultUpdate(parsedMessage, worker) {
  // Lấy dữ liệu từ parsedMessage[1] (theo format mới)
  const gameData = parsedMessage[1]

  if (!gameData) {
    logMessage(chalk.red(`[${getCurrentTime()}] Không tìm thấy dữ liệu game trong parsedMessage`))
    return
  }

  const sessionId = gameData.sessionId || "N/A"
  const jackpot = convertVnd(gameData.jackpotAmount) || "N/A"
  const resultType = gameData.result || null // "WHITE", "RED", "BLUE", etc.
  const gameStatus = gameData.status || "UNKNOWN"
  const isEnded = gameData.ended || false
  const budget = gameData?.wns[0]?.m || null
  const walletBalance =
    gameData?.wns && gameData.wns.length > 0
      ? gameData.wns
        .filter(w => w.wm > 0)
        .map(w => `${w.dn}: ${convertVnd(w.wm)}`)
        .join(" -> ") || "N/A"
      : "";

  const winBet =
    gameData?.wns && gameData.wns.length > 0
      ? gameData.wns
        .filter(w => w.m > 0)
        .map(w => `${w.dn}: ${convertVnd(w.m)}`)
        .join(" -> ") || "N/A"
      : "";


  // Log thông tin phiên
  printTable({
    "Phiên": sessionId,
    "Kết quả": resultType,
    "Trạng thái": gameStatus,
    "Jackpot": jackpot,
  })

  if (walletBalance && winBet) {
    logMessage(
      `Số dư ví: ${chalk.magenta(walletBalance)}. ` +
      `Thắng cược: ${chalk.red(winBet)}`
    );

  }

  worker.currentBudget = budget

  // Chỉ xử lý khi game đã kết thúc
  if (!isEnded || gameStatus !== "ENDED") {
    logMessage(chalk.yellow(`[${getCurrentTime()}] Game chưa kết thúc, bỏ qua xử lý kết quả`))
    return
  }

  // Reset zombie failure count on successful result
  if (ZOMBIE_MODE && worker.zombieFailureCount > 0) {
    logMessage(chalk.green(`[${getCurrentTime()}] Zombie Mode: Kết nối ổn định, reset failure count.`))
    worker.zombieFailureCount = 0
  }

  // Cập nhật jackpot hiện tại
  worker.currentJackpot = gameData.jackpotAmount || 0

  if (worker.currentJackpot < JACKPOT_THRESHOLD) {
    logMessage(chalk.red("Giá trị hũ dưới ngưỡng dừng. Bỏ cược"))
  }


  // Process Martingale logic
  if (IS_MARTINGALE && worker.lastBetChoice && worker.lastBetAmount > 0) {
    const won = processGameResult(resultType, worker.lastBetChoice, sessionId)
    worker.martingaleCurrentBet = calculateMartingaleBet(
      won,
      worker.baseBetAmount,
      worker.martingaleCurrentBet,
      worker.lastBetAmount
    )
  }

  // Reset bet info for next session
  worker.lastBetChoice = null
  worker.lastBetAmount = 0

  // Update game history với kết quả mới
  if (resultType) {
    worker.gameHistory.push(resultType)
    if (worker.gameHistory.length > 10) {
      worker.gameHistory.shift()
    }

    logMessage(chalk.green(`Lịch sử gần đây: [${worker.gameHistory.join(", ")}]`))
  }
}

/**
 * Handle bet confirmation
 * @param {GameWorker} worker 
 */
function handleBetConfirmation(worker) {
  logMessage(
    chalk.blue(`[${getCurrentTime()}] `) +
    `Phiên ${chalk.cyan(`#${worker.currentSessionId}`)} - ` +
    chalk.green(`Người dùng: ${worker.username}`) +
    ` - Đặt cược: ${chalk.red(worker.currentBetAmount)} đ. ` +
    chalk.magenta(`Cược thành công cửa: `) +
    chalk.yellow(worker.bettingChoice),
  )
  worker.isBettingAllowed = true
  worker.shouldRequestBudget = true
}

/**
 * Handle new game session
 * @param {object} parsedMessage 
 * @param {GameWorker} worker 
 */
function handleNewGameSession(parsedMessage, worker) {
  if (parsedMessage[1].sid !== worker.previousSessionId) {
    logMessage(
      chalk.blue(`[${getCurrentTime()}] `) +
      `Phiên mới bắt đầu: ${chalk.cyan(`#${worker.currentSessionId}`)}. Đang chờ đặt cược...`,
    )
    executeBettingLogic(worker, parsedMessage[1])
  }
}

/**
 * Handle budget update (merged from Simms functionality)
 * @param {object} parsedMessage 
 * @param {GameWorker} worker 
 */
function handleBudgetUpdate(parsedMessage, worker) {
  if (parsedMessage[1] && parsedMessage[1].As && typeof parsedMessage[1].As.gold === "number") {
    worker.currentBudget = parsedMessage[1].As.gold
    logMessage(chalk.blue(`[${getCurrentTime()}] `) + `Số dư ví: ${chalk.green(worker.currentBudget + " đ")}`)
  }
}

/**
 * Execute betting logic for a session
 * @param {GameWorker} worker 
 * @param {object} gameData 
 */
function executeBettingLogic(worker, gameData) {
  const sessionId = gameData?.sid ?? gameData?.sessionId
  const jackpot = gameData?.jackpotAmount ?? 0
  const status = gameData?.status ?? ""

  if (!sessionId) {
    logMessage(chalk.red("Không tìm thấy sessionId để đặt cược."))
    return
  }

  if (jackpot <= JACKPOT_THRESHOLD) {
    logMessage(
      chalk.gray(`[${getCurrentTime()}] `) +
      `Bỏ qua đặt cược cho phiên ${chalk.cyan(`#${sessionId}`)}: Hũ quá thấp.`,
    )
    return
  }

  if (status !== "BETTING") {
    logMessage(
      chalk.gray(`[${getCurrentTime()}] `) +
      `Không thể đặt cược. Trạng thái phiên hiện tại: ${chalk.yellow(status)}`,
    )
    return
  }

  const bettingDecision = determineBettingChoice(worker.gameHistory, config)
  console.log(bettingDecision, 'bettingDecision')
  if (!bettingDecision.choices?.length) {
    logMessage(
      chalk.gray(`[${getCurrentTime()}] `) +
      "Không tìm thấy quy tắc đặt cược phù hợp trong lịch sử gần đây.",
    )
    return
  }

  if (!worker.isBettingAllowed) {
    logMessage(chalk.yellow("Chưa được phép đặt cược, đang chờ xác nhận cược trước đó."))
    return
  }

  // Set betting choices and amounts
  worker.bettingChoice = bettingDecision.choices
  worker.currentBetAmount = config.gameSettings.IS_MARTINGALE
    ? worker.martingaleCurrentBet
    : bettingDecision.amounts

  // Check budget
  const budgetCheck = checkBudgetSufficiency(worker.currentBudget, worker.currentBetAmount)
  if (!budgetCheck.sufficient) {
    sendBudgetWarning(
      budgetCheck.reason,
      worker.currentBudget,
      worker.currentBetAmount,
      worker.lastBetAmount,
    )
    logMessage(
      chalk.red(`[${getCurrentTime()}] `) +
      `${budgetCheck.reason} Số dư hiện tại: ${convertVnd(worker.currentBudget)}. Đang dừng trò chơi.`,
    )
    worker.stop()
    return
  }

  // Map bettingChoice → bet commands
  const bets = expandBets(worker.bettingChoice, worker?.currentBetAmount)

  if (worker.mainGameConnection?.connected) {
    bets.forEach((bet, index) => {
      const delay = getRandomBettingDelay(500, 1500) * (index + 1)
      setTimeout(() => {
        const betCommand = `[6,"XGame","DragonWheelPlugin",{"cmd":1952,"b":${bet.amount},"eid":"${bet.choice}","sid":${sessionId}}]`

        worker.mainGameConnection.sendUTF(betCommand)
        worker.isBettingAllowed = false
        worker.lastBetAmount = bet.amount
        worker.lastBetChoice = bet.choice

        const logPrefix = config.gameSettings.IS_MARTINGALE ? "Martingale" : "Normal"
        logMessage(
          chalk.magenta(`[${getCurrentTime()}] `) +
          `Đã chọn quy tắc: ${chalk.yellow(bettingDecision.ruleName)} - Đặt cược (${logPrefix}): ${chalk.yellow(bet.choice)} với số tiền ${chalk.red(bet.amount)} đ.`,
        )
        logMessage(
          chalk.blue(`[${getCurrentTime()}] `) +
          `Đang cố gắng đặt ${bet.amount} đ vào cửa ${chalk.yellow(bet.choice)} cho phiên ${chalk.cyan(`#${sessionId}`)}.`,
        )
      }, delay)
    })
  } else {
    logMessage(chalk.red("Không thể gửi lệnh đặt cược: Kết nối chưa sẵn sàng."))
  }


  worker.previousSessionId = sessionId
}

/*------- GAME WORKER CLASS --------------------*/
class GameWorker {
  constructor(account) {
    this.account = account

    this.username = account[2]

    // WebSocket client and connection
    this.mainGameClient = new WebSocketClient()
    this.mainGameConnection = null

    // Game state
    this.isStopped = false
    this.isBettingAllowed = true
    this.shouldRequestBudget = true
    this.latestGameResult = null
    this.secondLatestGameResult = null
    this.currentSessionId = null
    this.previousSessionId = null
    this.bettingChoice = null
    this.currentBetAmount = DEFAULT_BET_AMOUNT
    this.currentBudget = null
    this.currentJackpot = 0
    this.gameHistory = []

    // Martingale state
    this.baseBetAmount = DEFAULT_BET_AMOUNT
    this.martingaleCurrentBet = this.baseBetAmount
    this.lastBetAmount = 0
    this.lastBetChoice = null

    // Management
    this.activeIntervals = []
    this.pingCounter = 2

    // Reconnection
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 5000
    this.reconnectTimeout = null

    // Zombie mode
    this.zombieReconnectAttempts = 0
    this.zombieReconnectDelay = 5 * 60 * 1000 // 5 phút
    this.zombieReconnectTimeout = null
    this.zombieFailureCount = 0

    // Bind methods
    this.handleConnectFailed = this.handleConnectFailed.bind(this)
    this.handleConnectionClose = this.handleConnectionClose.bind(this)
    this.handleConnectionError = this.handleConnectionError.bind(this)
    this.handleMainGameMessage = (msg) => handleMainGameMessage(msg, this)
  }

  /** ---------------- Martingale ---------------- */
  resetMartingaleState() {
    this.baseBetAmount = DEFAULT_BET_AMOUNT
    this.martingaleCurrentBet = this.baseBetAmount
    this.lastBetAmount = 0
    this.lastBetChoice = null
    if (IS_MARTINGALE) {
      logMessage(chalk.magenta(`[${getCurrentTime()}] Martingale state reset.`))
    }
  }

  /** ---------------- Interval Management ---------------- */
  addManagedInterval(callback, delay) {
    const id = setInterval(callback, delay)
    this.activeIntervals.push(id)
    return id
  }

  clearAllIntervals() {
    this.activeIntervals.forEach(clearInterval)
    this.activeIntervals = []
  }

  /** ---------------- Connection Management ---------------- */
  forceKillConnections() {
    logMessage(chalk.red(`[${getCurrentTime()}] Force killing all connections...`))

    this.clearAllIntervals()

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout)
    if (this.zombieReconnectTimeout) clearTimeout(this.zombieReconnectTimeout)
    this.reconnectTimeout = null
    this.zombieReconnectTimeout = null

    try {
      if (this.mainGameConnection) {
        this.mainGameConnection.close()
        this.mainGameConnection = null
      }
    } catch (e) {
      logMessage(chalk.yellow(`Error closing mainGame connection: ${e.message}`))
    }

    this.mainGameClient = new WebSocketClient()
  }

  /** ---------------- Event Handlers ---------------- */
  handleConnectFailed(error, clientName = "MainGame") {
    logMessage(chalk.red(`Connect failed (${clientName}): ${error}`))
    if (!this.isStopped) {
      ZOMBIE_MODE ? this.handleZombieReconnect(clientName, error) : this.tryReconnect(clientName)
    }
  }

  handleConnectionClose(reasonCode, description, clientName = "MainGame") {
    logMessage(chalk.yellow(`Connection closed (${clientName}): ${description}`))
    if (!this.isStopped) {
      ZOMBIE_MODE
        ? this.handleZombieReconnect(clientName, new Error(`Closed: ${description}`))
        : this.tryReconnect(clientName)
    }
  }

  handleConnectionError(error, clientName = "MainGame") {
    logMessage(chalk.red(`Error (${clientName}): ${error}`))
    if (!this.isStopped) {
      ZOMBIE_MODE ? this.handleZombieReconnect(clientName, error) : this.tryReconnect(clientName)
    }
  }

  /** ---------------- Reconnect Logic ---------------- */
  handleZombieReconnect(clientName, error) {
    this.zombieFailureCount++
    logMessage(chalk.magenta(`[${getCurrentTime()}] Zombie Mode: failure #${this.zombieFailureCount} (${clientName})`))

    if (this.zombieFailureCount % 3 === 0) {
      sendTelegramAlert({
        type: "error",
        title: "Zombie Mode failures",
        content: `Failed ${this.zombieFailureCount} times. Still retrying...`,
        metadata: {
          user: this.account[2],
          client: clientName,
          error: error.message,
          failureCount: this.zombieFailureCount,
          lastFailure: new Date().toLocaleString(),
        },
      })
    }

    this.forceKillConnections()

    logMessage(chalk.magenta(`[${getCurrentTime()}] Zombie Mode: retrying in 5m...`))
    this.zombieReconnectTimeout = setTimeout(() => {
      this.zombieReconnectAttempts++
      logMessage(chalk.magenta(`[${getCurrentTime()}] Zombie reconnect attempt #${this.zombieReconnectAttempts}`))
      this.start().catch((e) => logMessage(chalk.red(`Zombie reconnect failed: ${e.message}`)))
    }, this.zombieReconnectDelay)
  }

  tryReconnect(clientName) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      logMessage(
        chalk.yellow(`[${getCurrentTime()}] Reconnecting ${clientName} (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
      )
      this.reconnectTimeout = setTimeout(() => this.start(), this.reconnectDelay)
    } else {
      logMessage(chalk.red(`[${getCurrentTime()}] Max reconnects reached for ${clientName}`))
      if (ZOMBIE_MODE) {
        this.handleZombieReconnect(clientName, new Error("Max reconnect attempts reached"))
      } else {
        sendTelegramAlert({
          type: "error",
          title: "Reconnect failed",
          content: `Max reconnects reached for ${clientName}`,
          metadata: { user: this.account[2] },
        })
        this.stop(true)
      }
    }
  }

  /** ---------------- Connection Init ---------------- */
  initializeMainGameConnection() {
    // MiniGame
    this.mainGameConnection.sendUTF(
      JSON.stringify(this.account)
    )

    // Heartbeat + budget
    this.addManagedInterval(() => {
      if (this.isStopped || !this.mainGameConnection?.connected) return
      this.mainGameConnection.sendUTF(`[7,"Simms",${++this.pingCounter},0]`)

      // if (this.shouldRequestBudget) {
      //   this.mainGameConnection.sendUTF(`[6,"Simms","channelPlugin",{"cmd":310}]`)
      //   this.shouldRequestBudget = false
      // }
    }, 5000)
  }

  /** ---------------- Start / Stop ---------------- */
  async start() {
    this.isStopped = false

    return new Promise((resolve, reject) => {
      this.mainGameClient.on("connectFailed", (err) => {
        this.handleConnectFailed(err, "MainGame")
        reject(new Error(`MainGame connect failed: ${err.message}`))
      })

      this.mainGameClient.on("connect", (connection) => {
        this.mainGameConnection = connection
        logMessage(chalk.cyan("MainGame connected."))

        this.reconnectAttempts = 0
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout)
        if (ZOMBIE_MODE && this.zombieFailureCount > 0) this.zombieFailureCount = 0

        // Khởi tạo connection (heartbeat, handler, ...)
        this.initializeMainGameConnection()

        // --- Các handler chính ---
        this.mainGameConnection.on("message", this.handleMainGameMessage)
        this.mainGameConnection.on("error", (e) => this.handleConnectionError(e, "MainGame"))
        this.mainGameConnection.on("close", (code, desc) => this.handleConnectionClose(code, desc, "MainGame"))

        // 🔹 Gửi account trước
        this.mainGameConnection.sendUTF(JSON.stringify(this.account))

        // 🔹 Đợi một chút để server nhận account rồi mới gửi 2 lệnh tiếp theo
        setTimeout(() => {
          this.mainGameConnection.sendUTF(`[6,"XGame","DragonWheelPlugin",{"cmd":1950}]`)
          setTimeout(() => this.mainGameConnection.sendUTF(`[6,"XGame","DragonWheelPlugin",{"cmd":1959}]`), 500)
        }, 200)

        resolve()
      })

      this.mainGameClient.connect("wss://xgame.azhkthg1.net/sunrong")
    })
  }



  stop(isAutoStop = false) {
    if (this.isStopped) {
      logMessage(chalk.yellow(`GameWorker already stopped${isAutoStop ? " (auto)" : ""}.`))
      return
    }

    logMessage(chalk.red("Stopping GameWorker..."))
    this.isStopped = true

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout)
    if (this.zombieReconnectTimeout) clearTimeout(this.zombieReconnectTimeout)
    this.reconnectTimeout = null
    this.zombieReconnectTimeout = null

    this.reconnectAttempts = 0
    this.zombieReconnectAttempts = 0
    this.zombieFailureCount = 0

    this.clearAllIntervals()

    if (this.mainGameConnection?.connected) {
      this.mainGameConnection.close(1000, "Stopped by user")
    }

    if (!isAutoStop) {
      sendTelegramAlert({
        type: "warning",
        title: "Game stopped",
        content: "Please check system",
        metadata: {
          martingaleRate: `${this.lastBetAmount / RATE_MARTINGALE}`,
          zombieMode: ZOMBIE_MODE ? "ON" : "OFF",
        },
      })
    }

    logMessage(chalk.green("GameWorker stopped successfully."))
  }
}

/*------- GAME CONTROL FUNCTIONS --------*/
let activeGameWorker = null

/**
 * Start the game
 * @returns {Promise<void>}
 */
export const startGameDragon = async () => {
  if (activeGameWorker) {
    logError("Trò chơi đang chạy. Vui lòng dừng nó trước.")
    return
  }

  // Load config và init watcher
  loadConfig()
  initConfigWatcher()

  const users = await readUsers()

  // Tìm user đang active
  const categoryGame = "dragon";

  const selectedUser = users.find(
    (u) => Array.isArray(u) && u[4]?.isActive && u[4]?.categoryGame === categoryGame
  );

  if (!selectedUser) {
    return logError("Không tìm thấy người dùng được chọn. Vui lòng bật trạng thái `isActive` cho 1 user.")
  }

  // Giải cấu trúc theo format mới
  const [id, gameName, username, password, extra] = selectedUser
  if (!username || !password) {
    return logError("Thiếu thông tin tài khoản bắt buộc (username hoặc password).")
  }

  const { isActive, info, ...rest } = extra || {}

  // Gom dữ liệu thành mảng 5 phần tử
  const account = [
    id,
    gameName,
    username,
    password,
    {
      info: typeof info === "string" ? info : JSON.stringify(info || {}),
      ...rest, // signature, pid, subi, slom
    },
  ]

  try {
    activeGameWorker = new GameWorker(account)

    await activeGameWorker.start()
    logMessage(chalk.green("Trò chơi đã bắt đầu thành công!"))

    // Log game rules / settings
    logGameSettings()
  } catch (error) {
    logError(`Không thể bắt đầu trò chơi: ${error.message}`)
    console.error(error)
    activeGameWorker = null
  }
}



/**
 * Stop the game
 */
export const stopGameDragon = () => {
  if (activeGameWorker) {
    activeGameWorker.stop()
    activeGameWorker = null
    logMessage(chalk.green("Trò chơi đã dừng bởi người dùng."))
  } else {
    logError("Không có trò chơi nào đang hoạt động để dừng.")
  }
}

function logGameSettings() {
  logMessage(chalk.yellow("\n--- Quy tắc trò chơi ---"))
  config.gameRules.forEach((rule, index) =>
    logMessage(chalk.yellow(`${index + 1}. ${rule}`)),
  )

  logMessage(chalk.yellow("\n--- Quy tắc đặt cược đang hoạt động ---"))
  config.bettingRules
    .filter((rule) => rule.active)
    .sort((a, b) => a.priority - b.priority)
    .forEach((rule, index) =>
      logMessage(
        chalk.yellow(
          `${index + 1}. [Ưu tiên: ${rule.priority}] ${rule.description} (Cược: ${Array.isArray(rule.betAmount)
            ? rule.betAmount.join(", ") + " đ"
            : (rule.betAmount || config.gameSettings.BET_AMOUNT) + " đ"
          })`,
        ),
      ),
    )

  logMessage(
    chalk.yellow(
      `Số tiền đặt cược mặc định: ${chalk.green(config.gameSettings.BET_AMOUNT + " đ")}`,
    ),
  )
  logMessage(
    chalk.yellow(
      `Ngưỡng hũ để tiếp tục chơi: ${chalk.green(config.gameSettings.JACKPOT_THRESHOLD + " đ")}`,
    ),
  )
  logMessage(
    chalk.yellow(
      `Ngưỡng dừng cược: ${chalk.green(config.gameSettings.BET_STOP + " đ")}`,
    ),
  )
  logMessage(
    chalk.yellow(
      `Chế độ Martingale: ${config.gameSettings.IS_MARTINGALE ? "BẬT" : "TẮT"}`,
    ),
  )

  if (config.gameSettings.IS_MARTINGALE) {
    logMessage(
      chalk.yellow(`Tỷ lệ gấp thếp: ${config.gameSettings.RATE_MARTINGALE}`),
    )
  }

  logMessage(
    chalk.yellow(
      `Chế độ Zombie: ${config.gameSettings.ZOMBIE ? "BẬT" : "TẮT"}`,
    ),
  )
}
