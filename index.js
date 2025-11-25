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
import { fishMenu } from './src/ui/fish.js';
import { startGameFish, stopGameFish } from './src/socket/fish-prawn-carb.js';
import { bacaratMenu } from './src/ui/baracat.js';
import { startGameBaracat, stopGameBaracat } from './src/socket/bracat.js';
import { shakeDiskLiveMenu } from './src/ui/shake-live.js';
import { startGameShakeDiskLive, stopGameShakeDiskLive } from './src/socket/shake-disk-live.js';


async function main() {
  // banner();

  // while (true) {
  //   let mainCmd;
  //   try {
  //     mainCmd = await mainMenu();
  //   } catch (err) {
  //     if (err.name === "ExitPromptError") {
  //       console.log("👋 Hẹn gặp lại bạn lần sau");
  //       process.exit(0);
  //     }
  //     throw err;
  //   }
    
  //   switch (mainCmd) {
  //     case 'dragon_hunt': {
  //       const dragonCmd = await dragonMenu();
    
  //       switch (dragonCmd) {
  //         case 'dragon_hunt_start':
  //           await startGameDragon();
  //           break;

  //           case 'dragon_hunt_stop':
  //           await stopGameDragon();
  //           break;
    
  //         case 'setting_dragon_hunt':
  //           openHtml('dragon-hunt-settings.html');
  //           break;
    
  //         case 'exit':
  //           console.log('👋 Thoát menu săn rồng');
  //           break;
    
  //         default:
  //           console.log('⚠️ Lệnh không hợp lệ:', dragonCmd);
  //           break;
  //       }
  //       break;
  //     }
  //     case 'shake-disk': {
  //       const shakeDiskCmd = await shakeDiskMenu();
    
  //       switch (shakeDiskCmd) {
  //         case 'shake_disk_start':
  //           await startGameShakeDisk();
  //           break;

  //           case 'shake_disk_stop':
  //           await stopGameShakeDisk();
  //           break;
    
  //         case 'shake_disk_setting':
  //           openHtml('shake-disk-settings.html');
  //           break;
    
  //         case 'exit':
  //           console.log('👋 Thoát menu tứ linh');
  //           break;
    
  //         default:
  //           console.log('⚠️ Lệnh không hợp lệ:', shakeDiskCmd);
  //           break;
  //       }
    
  //       break;
  //     }

  //     case 'shake-disk-live': {
  //       const shakeDiskLiveCmd = await shakeDiskLiveMenu();
    
  //       switch (shakeDiskLiveCmd) {
  //         case 'shake_disk_live_start':
  //           await startGameShakeDiskLive();
  //           break;

  //           case 'shake_disk_live_stop':
  //           await stopGameShakeDiskLive();
  //           break;
    
  //         case 'shake_disk_live_setting':
  //           openHtml('shake-disk-live-settings.html');
  //           break;
    
  //         case 'exit':
  //           console.log('👋 Thoát menu tứ linh');
  //           break;
    
  //         default:
  //           console.log('⚠️ Lệnh không hợp lệ:', shakeDiskLiveCmd);
  //           break;
  //       }
    
  //       break;
  //     }

  //       case 'bacarat_live': {
  //         const bacaratCmd = await bacaratMenu();
      
  //         switch (bacaratCmd) {
  //           case 'bacarat_start':
  //             await startGameBaracat();
  //             break;
  
  //             case 'bacarat_stop':
  //             await stopGameBaracat();
  //             break;
      
  //           case 'bacarat_setting':
  //             openHtml('bacarat-settings.html');
  //             break;
      
  //           case 'exit':
  //             console.log('👋 Thoát menu bầu cua');
  //             break;
      
  //           default:
  //             console.log('⚠️ Lệnh không hợp lệ:', bacaratCmd);
  //             break;
  //         }
      
  //         break;
  //       }

  //       case 'fish_prawn_carb': {
  //         const fishCmd = await fishMenu();
      
  //         switch (fishCmd) {
  //           case 'fish_start':
  //             await startGameFish();
  //             break;
  
  //             case 'fish_stop':
  //             await stopGameFish();
  //             break;
      
  //           case 'fish_setting':
  //             openHtml('fish-prawn-carb-settings.html');
  //             break;
      
  //           case 'exit':
  //             console.log('👋 Thoát menu bầu cua');
  //             break;
      
  //           default:
  //             console.log('⚠️ Lệnh không hợp lệ:', fishCmd);
  //             break;
  //         }
      
  //         break;
  //       }

  //     case 'account_manager':
  //       openHtml('account-manager.html');
  //       break;

  //     default:
  //       console.log('⚠️ Lệnh không hợp lệ:', mainCmd);
  //       break;
  //   }
  // }
  await startGameFish();
}

main().catch(err => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
