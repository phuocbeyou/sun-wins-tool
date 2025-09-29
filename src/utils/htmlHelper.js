import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function openHtml(file) {
  const filePath = path.join(__dirname, 'html', file);
  const platform = process.platform;

  if (platform === 'darwin') {
    exec(`open "${filePath}"`); // macOS: dùng browser mặc định
  } else if (platform === 'win32') {
    exec(`start "" "${filePath}"`); // Windows
  } else {
    exec(`xdg-open "${filePath}"`); // Linux
  }
}
