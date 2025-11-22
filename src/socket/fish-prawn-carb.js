import chalk from "chalk"
import websocket from "websocket"
import fs from "fs"
import { fileURLToPath } from "url"
import { dirname } from "path"
import path from "path"
import { readUsers } from "../utils/dataManager.js"
import { sendTelegramAlert } from "../utils/botHelper.js"
import { convertVnd, expandBets, getLabelByRes, getLabelByValue, getLabelByValueFish, printBetResult } from "../utils/betHelper.js"
import { logError, printTable } from "../utils/helperCmd.js"
import { CMD_BET, CMD_BUDGET, CMD_END, CMD_START, CMD_JACKPOT } from "../contants/fish-prawn-carb.js"
import { SocketClient } from "./socketClient.js"

const WebSocketClient = websocket.client
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const configPath = path.resolve(__dirname, "../config/fish-prawn-crab.json")

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

let JACKPOT_RANGES

/**
 * Load configuration from rule.json file
 */
function loadConfig() {
  try {
    const newConfig = JSON.parse(fs.readFileSync(configPath, "utf8"))
    config = newConfig
    DEFAULT_BET_AMOUNT = config.gameSettings.BET_AMOUNT
    JACKPOT_THRESHOLD = config.gameSettings.JACKPOT_THRESHOLD
    JACKPOT_RANGES = config.gameSettings.JACKPOT_RANGES || [] // 🆕 THÊM DÒNG NÀY
    BET_STOP = config.gameSettings.BET_STOP
    TIME_SEND_MESS = config.gameSettings.TIME_SEND_MESS
    IS_MARTINGALE = config.gameSettings.IS_MARTINGALE
    RATE_MARTINGALE = config.gameSettings.RATE_MARTINGALE
    ZOMBIE_MODE = config.gameSettings.ZOMBIE || false

    logMessage(chalk.green(`[${getCurrentTime()}] Cấu hình rule.json đã được tải lại.`))
    logMessage(chalk.yellow(`Chế độ Martingale: ${IS_MARTINGALE ? "BẬT" : "TẮT"}`))
    logMessage(chalk.yellow(`Chế độ Zombie: ${ZOMBIE_MODE ? "BẬT" : "TẮT"}`))

    // 🆕 THÊM ĐOẠN NÀY - Log JACKPOT_RANGES
    if (JACKPOT_RANGES.length > 0) {
      logMessage(chalk.yellow(`Khoảng Jackpot cho phép:`))
      JACKPOT_RANGES.forEach((range, idx) => {
        logMessage(chalk.yellow(`  ${idx + 1}. ${convertVnd(range.MIN)} - ${convertVnd(range.MAX)}`))
      })
    }

    if (IS_MARTINGALE) {
      logMessage(chalk.yellow(`Tỷ lệ gấp thếp: ${RATE_MARTINGALE}`))
    }
  } catch (error) {
    console.error(chalk.red(`Lỗi khi đọc hoặc phân tích cú pháp rule.json: ${error.message}`))
  }
}

// ============================================
// THAY ĐỔI 3: Thêm hàm isJackpotInAllowedRange() (sau sendBudgetWarning, dòng ~128)
// ============================================
/**
 * Check if jackpot is within allowed ranges
 * @param {number} jackpot 
 * @returns {boolean}
 */
function isJackpotInAllowedRange(jackpot) {
  if (!JACKPOT_RANGES || JACKPOT_RANGES.length === 0) {
    return true
  }

  return JACKPOT_RANGES.some(range => {
    return jackpot >= range.MIN && jackpot <= range.MAX
  })
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
  const recentHistory = [...gameHistory].reverse();
  const activeRules = config.bettingRules
    .filter(rule => rule.active)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of activeRules) {
    if (!rule.pattern || rule.pattern.length === 0) {
      return {
        choices: rule.betOn,
        amounts: rule.betAmount?.length ? rule.betAmount : [config.gameSettings.BET_AMOUNT],
        ruleName: rule.description,
      }
    }

    if (recentHistory.length >= rule.pattern.length) {
      const historySlice = recentHistory.slice(0, rule.pattern.length);

      const patternMatches = rule.pattern.every((patternVal, index) => {
        const patternSet = new Set(patternVal.split('-'));
        const historySet = new Set(historySlice[index].split('-'));
        if (patternSet.size !== historySet.size) return false;
        return [...patternSet].every(v => historySet.has(v));
      });

      if (patternMatches) {
        return {
          choices: rule.betOn,
          amounts: rule.betAmount?.length
            ? rule.betAmount
            : [config.gameSettings.BET_AMOUNT],
          ruleName: rule.description,
        };
      }
    }
  }

  return { choices: [], amounts: [], ruleName: null };
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
    return baseBetAmount
  } else {
    return Math.ceil(lastBetAmount * RATE_MARTINGALE)
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

  if (messageString.includes(`"cmd":${CMD_START}`)) {
    handleGameStart(parsedMessage, worker)
  } else if (messageString.includes(`"cmd":${CMD_END}`)) {
    handleGameResultUpdate(parsedMessage, worker)
  } else if (messageString.includes(`"cmd":${CMD_JACKPOT}`)) {
    handleJackpotUpdate(parsedMessage, worker)
  } else if (messageString.includes(`"cmd":${CMD_BUDGET}`)) {
    handleBudgetUpdate(parsedMessage, worker)
  } else if (messageString.includes(`"cmd":${CMD_BET}`)) {
    handleConfirmBet(parsedMessage, worker)
  }
}


// ============================================
// THAY ĐỔI 4: Cập nhật handleGameStart()
// ============================================
function handleGameStart(parsedMessage, worker) {
  // 🆕 THAY ĐỔI: Kiểm tra cả THRESHOLD và RANGES
  if (worker.currentJackpot < JACKPOT_THRESHOLD) {
    return console.log(chalk.red(`Giá trị hũ ${convertVnd(worker.currentJackpot)} dưới ngưỡng dừng. Bỏ cược`))
  }
  
  // 🆕 THÊM ĐOẠN NÀY
  if (!isJackpotInAllowedRange(worker.currentJackpot)) {
    return console.log(chalk.red(`Giá trị hũ ${convertVnd(worker.currentJackpot)} không nằm trong khoảng cho phép. Bỏ cược`))
  }
  
  logMessage(chalk.blue("Game bắt đầu, chờ đặt cược ..."))
  
  executeBettingLogic(worker, parsedMessage[1])
}

/**
 * Handle game result update
 * @param {object} parsedMessage 
 * @param {GameWorker} worker 
 */
function handleGameResultUpdate(parsedMessage, worker) {
  const gameData = parsedMessage[1]

  if (!gameData) {
    logMessage(chalk.red(`[${getCurrentTime()}] Không tìm thấy dữ liệu game trong parsedMessage`))
    return
  }
  
  const arrDices = gameData?.dices || []

  if (arrDices.length === 0) {
    return;
  }

  const diceValues = Object?.values(gameData?.rt);

  const roundResult = diceValues
    .map(v => getLabelByValueFish(v))
    .join("-")

  printTable({
    "Kết quả": roundResult || "Không có dữ liệu",
  });
  
  // 📢 Thông báo room: Kết quả game
  // if (worker.socketClient) {
  //   worker.socketClient.sendRoomNotify("game-result", {
  //     result: roundResult,
  //     dices: diceValues,
  //     timestamp: Date.now()
  //   })
  // }
  
  if (ZOMBIE_MODE && worker.zombieFailureCount > 0) {
    logMessage(chalk.green(`[${getCurrentTime()}] Zombie Mode: Kết nối ổn định, reset failure count.`))
    worker.zombieFailureCount = 0
  }

  if (roundResult) {
    worker.gameHistory.push(roundResult);
    if (worker.gameHistory.length > 10) {
      worker.gameHistory.shift();
    }
  
    console.log(chalk.green(`Lịch sử gần đây: [${worker.gameHistory.join(", ")}]`));
  }
}

/**
 * Handle budget update
 * @param {object} parsedMessage 
 * @param {GameWorker} worker 
 */
function handleBudgetUpdate(parsedMessage, worker) {
  if (parsedMessage[1] && parsedMessage[1].As && typeof parsedMessage[1].As.gold === "number") {
    const oldBudget = worker.currentBudget
    worker.currentBudget = parsedMessage[1].As.gold
    
    logMessage(chalk.blue(`[${getCurrentTime()}] `) + `Số dư ví: ${chalk.green(worker.currentBudget + " đ")}`)
    
    // 📤 Gửi thông tin user mới lên server
    if (worker.socketClient) {
      worker.socketClient.sendUserInfo(worker.currentBudget)
    }
    
    // ⚠️ Kiểm tra nếu hết tiền
    if (worker.currentBudget <= BET_STOP && oldBudget > BET_STOP) {
      if (worker.socketClient) {
        worker.socketClient.reportUserError("out-of-money")
      }
    }
  }
}

/**
 * Handle confirm bet
 * @param {object} parsedMessage 
 * @param {GameWorker} worker 
 */
function handleConfirmBet(parsedMessage, worker) {
  if (parsedMessage[1]) {
    console.log(
      chalk.blue(`[${getCurrentTime()}] `) + 
      `Đặt cược thành công: ${chalk.green(convertVnd(parsedMessage[1]?.b))} cửa ${chalk.redBright(getLabelByValueFish(parsedMessage[1]?.eid))} `
    )
    
    // 📢 Thông báo room: Đã đặt cược
    if (worker.socketClient) {
      worker.socketClient.sendRoomNotify("bet-placed", {
        amount: parsedMessage[1]?.b,
        choice: getLabelByValueFish(parsedMessage[1]?.eid),
        timestamp: Date.now()
      })
    }
  }
  worker.isBettingAllowed = true
  worker.shouldRequestBudget = true
}

/**
 * Handle jackpot update
 * @param {object} parsedMessage 
 * @param {GameWorker} worker 
 */
function handleJackpotUpdate(parsedMessage, worker) {
  const data = parsedMessage[1];
  if (data && typeof data.ba === "number") {
    worker.currentJackpot = data?.ba;
    console.log(
      chalk.blue(`[${getCurrentTime()}] `) +
      `Jackpot hiện tại: ${chalk.green(convertVnd(worker.currentJackpot))}`
    );
    
    // 🆕 THÊM ĐOẠN NÀY - Kiểm tra jackpot khi update
    if (worker.currentJackpot < JACKPOT_THRESHOLD) {
      console.log(chalk.red(`Giá trị hũ dưới ngưỡng dừng. Bỏ cược`))
    } else if (!isJackpotInAllowedRange(worker.currentJackpot)) {
      console.log(chalk.red(`Giá trị hũ không nằm trong khoảng cho phép. Bỏ cược`))
    }
  }
}

/**
 * Execute betting logic for a session
 * @param {GameWorker} worker 
 * @param {object} gameData 
 */
function executeBettingLogic(worker, gameData) {
  if (worker?.currentJackpot <= JACKPOT_THRESHOLD) {
    console.log(
      chalk.gray(`[${getCurrentTime()}] `) +
      `Bỏ qua đặt cược: Hũ quá thấp (${convertVnd(worker.currentJackpot)}).`,
    )
    return
  }

  if (!isJackpotInAllowedRange(worker?.currentJackpot)) {
    console.log(
      chalk.gray(`[${getCurrentTime()}] `) +
      `Bỏ qua đặt cược: Hũ ${convertVnd(worker.currentJackpot)} không nằm trong khoảng cho phép.`,
    )
    return
  }
  
  const bettingDecision = determineBettingChoice(worker.gameHistory, config)

  if (!bettingDecision.choices?.length) {
    console.log(
      chalk.gray(`[${getCurrentTime()}] `) +
      "Không tìm thấy quy tắc đặt cược phù hợp trong lịch sử gần đây.",
    )
    return
  } else {
    printBetResult(bettingDecision)
  }

  worker.bettingChoice = bettingDecision.choices
  worker.currentBetAmount = config.gameSettings.IS_MARTINGALE
    ? worker.martingaleCurrentBet
    : bettingDecision.amounts
  
  const budgetCheck = checkBudgetSufficiency(worker.currentBudget, worker.currentBetAmount)
  
  if (!budgetCheck.sufficient) {
    sendBudgetWarning(
      budgetCheck.reason,
      worker.currentBudget,
      worker.currentBetAmount,
      worker.lastBetAmount,
    )
    console.log(
      chalk.red(`[${getCurrentTime()}] `) +
      `${budgetCheck.reason} Số dư hiện tại: ${convertVnd(worker.currentBudget)}. Đang dừng trò chơi.`,
    )
    
    // ⚠️ Báo lỗi qua socket
    if (worker.socketClient) {
      worker.socketClient.reportUserError(
        budgetCheck.reason.includes("dưới ngưỡng") 
          ? "below-bet-stop" 
          : "insufficient-balance"
      )
    }
    
    worker.stop()
    return
  }

  if (!worker.isBettingAllowed) {
    console.log(chalk.yellow("Chưa được phép đặt cược, đang chờ xác nhận cược trước đó."))
    return
  }

  const bets = expandBets(worker.bettingChoice, worker?.currentBetAmount)

  if (worker.mainGameConnection?.connected) {
    bets.forEach((bet, index) => {
      const delay = getRandomBettingDelay(500, 1500) * (index + 1)
      setTimeout(() => {
        const betCommand = `[6,"ShakeDisk","BauCuaPlugin",{"cmd":900,"eid":"${bet.choice}","v":${bet.amount}}]`

        worker.mainGameConnection.sendUTF(betCommand)
        worker.isBettingAllowed = false
        worker.lastBetAmount = bet.amount
        worker.lastBetChoice = bet.choice

        const logPrefix = config.gameSettings.IS_MARTINGALE ? "Martingale" : "Normal"
        logMessage(
          chalk.magenta(`[${getCurrentTime()}] `) +
          `Đã chọn quy tắc: ${chalk.yellow(bettingDecision.ruleName)} - Đặt cược (${logPrefix}): ${chalk.yellow(getLabelByValue(bet.choice))} với số tiền ${chalk.red(convertVnd(bet.amount))}`,
        )
      }, delay)
    })
  } else {
    logMessage(chalk.red("Không thể gửi lệnh đặt cược: Kết nối chưa sẵn sàng."))
    
    // ⚠️ Báo lỗi connection
    if (worker.socketClient) {
      worker.socketClient.reportUserError("connection-not-ready")
    }
  }
}

/*------- GAME WORKER CLASS --------------------*/
class GameWorker {
  constructor(account, roomId) {
    this.account = account
    this.username = account[2]
    this.roomId = roomId

    // WebSocket client and connection
    this.mainGameClient = new WebSocketClient()
    this.mainGameConnection = null

    // 🔌 Socket.IO client
    this.socketClient = null

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
    this.zombieReconnectDelay = 5 * 60 * 1000
    this.zombieReconnectTimeout = null
    this.zombieFailureCount = 0

    // Bind methods
    this.handleConnectFailed = this.handleConnectFailed.bind(this)
    this.handleConnectionClose = this.handleConnectionClose.bind(this)
    this.handleConnectionError = this.handleConnectionError.bind(this)
    this.handleMainGameMessage = (msg) => handleMainGameMessage(msg, this)
  }

  /** ---------------- Socket.IO Methods ---------------- */
  initializeSocketClient() {
    if (!this.roomId) {
      logMessage(chalk.yellow("⚠️ Không có roomId, bỏ qua khởi tạo SocketClient"))
      return
    }

    this.socketClient = new SocketClient({
      userId: this.username,
      roomId: this.roomId,
    })
    
    this.socketClient.connect()
    
    // 📤 Override phương thức sendUserInfo để gửi thông tin thật
    this.socketClient.sendUserInfo = (coin = this.currentBudget) => {
      this.socketClient.socket.emit("response-user-info", {
        roomId: this.roomId,
        userId: this.username,
        coin: coin || 0,
      })
    }

    this.socketClient.respondUserInfo = (coin = this.currentBudget) => {
      this.socketClient.socket.emit("response-user-info", {
        roomId: this.roomId,
        userId: this.username,
        coin: coin || 0,
      })
    }
    
    logMessage(chalk.green(`✅ SocketClient initialized for room: ${this.roomId}`))
  }

  disconnectSocketClient() {
    if (this.socketClient) {
      this.socketClient.leaveRoom()
      this.socketClient = null
      this.stop()
      logMessage(chalk.yellow("🚪 SocketClient disconnected"))
    }
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
    
    // Disconnect socket client
    this.disconnectSocketClient()
  }

  /** ---------------- Event Handlers ---------------- */
  handleConnectFailed(error, clientName = "MainGame") {
    logMessage(chalk.red(`Connect failed (${clientName}): ${error}`))
    
    // ⚠️ Báo lỗi connection
    if (this.socketClient) {
      this.socketClient.reportUserError(`connect-failed: ${clientName}`)
    }
    
    if (!this.isStopped) {
      ZOMBIE_MODE ? this.handleZombieReconnect(clientName, error) : this.tryReconnect(clientName)
    }
  }

  handleConnectionClose(reasonCode, description, clientName = "MainGame") {
    logMessage(chalk.yellow(`Connection closed (${clientName}): ${description}`))
    
    // ⚠️ Báo lỗi connection
    if (this.socketClient) {
      this.socketClient.reportUserError(`connection-closed: ${description}`)
    }
    
    if (!this.isStopped) {
      ZOMBIE_MODE
        ? this.handleZombieReconnect(clientName, new Error(`Closed: ${description}`))
        : this.tryReconnect(clientName)
    }
  }

  handleConnectionError(error, clientName = "MainGame") {
    logMessage(chalk.red(`Error (${clientName}): ${error}`))
    
    // ⚠️ Báo lỗi connection
    if (this.socketClient) {
      this.socketClient.reportUserError(`connection-error: ${error.message}`)
    }
    
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
      
      // ⚠️ Báo lỗi zombie mode
      if (this.socketClient) {
        this.socketClient.reportUserError(`zombie-mode-failure-${this.zombieFailureCount}`)
      }
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
      
      // ⚠️ Báo lỗi max reconnect
      if (this.socketClient) {
        this.socketClient.reportUserError("max-reconnect-reached")
      }
      
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
    this.mainGameConnection.sendUTF(
      JSON.stringify(this.account)
    )

    this.addManagedInterval(() => {
      if (this.isStopped || !this.mainGameConnection?.connected) return
      this.mainGameConnection.sendUTF(`[7,"Simms",${++this.pingCounter},0]`)
    }, 5000)
  }

  /** ---------------- Start / Stop ---------------- */
  async start() {
    this.isStopped = false

    // 🔌 Khởi tạo SocketClient trước
    this.initializeSocketClient()

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
          this.mainGameConnection.sendUTF(`[6,"ShakeDisk","BauCuaPlugin",{"cmd":1950}]`)
          setTimeout(() => this.mainGameConnection.sendUTF(`[6,"ShakeDisk","BauCuaPlugin",{"cmd":1960,"t":"BET"}]`), 500)
        }, 200)

        resolve()
      })

      this.mainGameClient.connect("wss://xdtl.azhkthg1.net/websocket")
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
    
    // 🚪 Disconnect socket client
    this.disconnectSocketClient()

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
 * @param {string} roomId - Room ID cho Socket.IO (optional)
 * @returns {Promise<void>}
 */
export const startGameFish = async (roomId = null) => {
  if (activeGameWorker) {
    logError("Trò chơi đang chạy. Vui lòng dừng nó trước.")
    return
  }

  // Load config và init watcher
  loadConfig()
  initConfigWatcher()

  const users = await readUsers()

  // Tìm user đang active
  const categoryGame = "fish_crab";

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

  // const ROOM_ID = "bau_cua_room_1";

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
    // 🔌 Truyền roomId vào GameWorker
    activeGameWorker = new GameWorker(account)

    await activeGameWorker.start()
    logMessage(chalk.green("Trò chơi đã bắt đầu thành công!"))

    // Log game rules / settings
    logGameSettings()
  } catch (error) {
    logError(`Không thể bắt đầu trò chơi: ${error.message}`)
    console.error(error)
    
    // ⚠️ Báo lỗi khi start game thất bại
    if (activeGameWorker?.socketClient) {
      activeGameWorker.socketClient.reportUserError(`start-game-failed: ${error.message}`)
    }
    
    activeGameWorker = null
  }
}

/**
 * Stop the game
 */
export const stopGameFish = () => {
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
  
  // 🆕 THÊM ĐOẠN NÀY - Log JACKPOT_RANGES
  if (JACKPOT_RANGES && JACKPOT_RANGES.length > 0) {
    logMessage(chalk.yellow(`Khoảng Jackpot cho phép:`))
    JACKPOT_RANGES.forEach((range, idx) => {
      logMessage(
        chalk.yellow(
          `  ${idx + 1}. ${chalk.green(convertVnd(range.MIN))} - ${chalk.green(convertVnd(range.MAX))}`
        )
      )
    })
  }
  
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