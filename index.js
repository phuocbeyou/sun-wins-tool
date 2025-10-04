import { banner } from './src/ui/banner.js';
import { mainMenu } from './src/ui/mainMenu.js';
import { openHtml } from './src/utils/htmlHelper.js';

// Import socket/game handlers
// import { startDragonHunt, stopDragonHunt } from './src/games/dragonHunt.js';
// import { startXocDiaTuLinh, stopXocDiaTuLinh } from './src/games/xocDiaTuLinh.js';
// import { startXocDiaLive, stopXocDiaLive } from './src/games/xocDiaLive.js';
// import { startBacaratLive, stopBacaratLive } from './src/games/bacaratLive.js';
// import { startBauCua, stopBauCua } from './src/games/bauCua.js';

import './server.js';
import { startGameDragon, stopGameDragon } from './src/socket/dragon-socket.js';
import { dragonMenu } from './src/ui/dragon.js';
import { startGameShakeDisk, stopGameShakeDisk } from './src/socket/shake-disk.js';
import { shakeDiskMenu } from './src/ui/shake.js';


async function main() {
  banner();

  while (true) {
    let mainCmd;
    try {
      mainCmd = await mainMenu();
    } catch (err) {
      if (err.name === "ExitPromptError") {
        console.log("👋 Hẹn gặp lại bạn lần sau");
        process.exit(0);
      }
      throw err;
    }
    
    switch (mainCmd) {
      case 'dragon_hunt': {
        const dragonCmd = await dragonMenu();
    
        switch (dragonCmd) {
          case 'dragon_hunt_start':
            await startGameDragon();
            break;

            case 'dragon_hunt_stop':
            await stopGameDragon();
            break;
    
          case 'setting_dragon_hunt':
            openHtml('dragon-hunt-settings.html');
            break;
    
          case 'exit':
            console.log('👋 Thoát menu săn rồng');
            break;
    
          default:
            console.log('⚠️ Lệnh không hợp lệ:', dragonCmd);
            break;
        }
        break;
      }
      case 'shake-disk': {
        const shakeDiskCmd = await shakeDiskMenu();
    
        switch (shakeDiskCmd) {
          case 'shake_disk_start':
            await startGameShakeDisk();
            break;

            case 'shake_disk_stop':
            await stopGameShakeDisk();
            break;
    
          case 'shake_disk_setting':
            openHtml('shake-disk-settings.html');
            break;
    
          case 'exit':
            console.log('👋 Thoát menu tứ linh');
            break;
    
          default:
            console.log('⚠️ Lệnh không hợp lệ:', shakeDiskCmd);
            break;
        }
    
        break;
      }

      case 'xoc_dia_live':
        // await startXocDiaLive();
        break;

      case 'bacarat_live':
        // await startBacaratLive();
        break;

      case 'bau_cua':
        // await startBauCua();
        break;

      case 'account_manager':
        openHtml('account-manager.html');
        break;

      default:
        console.log('⚠️ Lệnh không hợp lệ:', mainCmd);
        break;
    }
  }
}

main().catch(err => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
