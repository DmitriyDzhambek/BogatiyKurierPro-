const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const appDataPath = path.join(__dirname, 'app-data');
app.setPath('userData', appDataPath);
app.setPath('cache', path.join(appDataPath, 'cache'));
try { fs.mkdirSync(appDataPath, { recursive: true }); } catch (_) {}
try { fs.mkdirSync(path.join(appDataPath, 'cache'), { recursive: true }); } catch (_) {}

let mainWindow;
let voiceEnabled = true;
let monitorTimer = null;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: '#080604',
    title: 'Богатый курьер Pro',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist-react', 'index.html'));
  }
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 МБ';
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} МБ`;
  return `${(mb / 1024).toFixed(1)} ГБ`;
}

function getFolderSize(folderPath, depth = 0) {
  if (depth > 5) return 0;
  let size = 0;
  try {
    if (!fs.existsSync(folderPath)) return 0;
    for (const item of fs.readdirSync(folderPath)) {
      try {
        const itemPath = path.join(folderPath, item);
        const stats = fs.statSync(itemPath);
        if (stats.isFile()) size += stats.size;
        if (stats.isDirectory()) size += getFolderSize(itemPath, depth + 1);
      } catch (_) {}
    }
  } catch (_) {}
  return size;
}

function getCleanerTargets() {
  const home = os.homedir();
  return [
    { name: 'Windows Temp', path: process.env.TEMP || 'C:\\Windows\\Temp', type: 'temp' },
    { name: 'User Temp', path: process.env.TMP || path.join(home, 'AppData\\Local\\Temp'), type: 'temp' },
    { name: 'Local Temp', path: path.join(home, 'AppData\\Local\\Temp'), type: 'temp' },
    { name: 'Chrome Cache', path: path.join(home, 'AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache'), type: 'cache' },
    { name: 'Chrome Code Cache', path: path.join(home, 'AppData\\Local\\Google\\Chrome\\User Data\\Default\\Code Cache'), type: 'cache' },
    { name: 'Edge Cache', path: path.join(home, 'AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache'), type: 'cache' },
    { name: 'Edge Code Cache', path: path.join(home, 'AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Code Cache'), type: 'cache' },
    { name: 'Internet Cache', path: path.join(home, 'AppData\\Local\\Microsoft\\Windows\\INetCache'), type: 'cache' },
    { name: 'Windows Logs', path: 'C:\\Windows\\Logs', type: 'logs' },
    { name: 'Delivery Optimization', path: 'C:\\Windows\\SoftwareDistribution\\Download', type: 'updates' }
  ];
}

function deleteInside(folderPath) {
  let cleaned = 0;
  try {
    if (!fs.existsSync(folderPath)) return 0;
    for (const item of fs.readdirSync(folderPath)) {
      try {
        const itemPath = path.join(folderPath, item);
        const stats = fs.statSync(itemPath);
        if (stats.isFile()) {
          cleaned += stats.size;
          fs.unlinkSync(itemPath);
        } else if (stats.isDirectory()) {
          cleaned += getFolderSize(itemPath);
          fs.rmSync(itemPath, { recursive: true, force: true });
        }
      } catch (_) {}
    }
  } catch (_) {}
  return cleaned;
}

function getDiskInfo() {
  try {
    const output = execSync('wmic logicaldisk where DeviceID="C:" get FreeSpace,Size /format:csv').toString();
    const line = output.trim().split(/\r?\n/).find((value) => value.includes('C:'));
    if (line) {
      const parts = line.split(',');
      const free = Number(parts[1]);
      const total = Number(parts[2]);
      return {
        freeBytes: free,
        totalBytes: total,
        free: formatSize(free),
        total: formatSize(total),
        freePercent: Math.round((free / total) * 100),
        usedPercent: Math.round(((total - free) / total) * 100)
      };
    }
  } catch (_) {}

  const fallbackTotal = 500 * 1024 * 1024 * 1024;
  const fallbackFree = 100 * 1024 * 1024 * 1024;
  return {
    freeBytes: fallbackFree,
    totalBytes: fallbackTotal,
    free: formatSize(fallbackFree),
    total: formatSize(fallbackTotal),
    freePercent: 20,
    usedPercent: 80
  };
}

function buildAdvice(info = getDiskInfo()) {
  if (info.freePercent < 15) return '⚠️ На диске критически мало места. Запустите анализ и очистку прямо сейчас.';
  if (info.freePercent < 30) return '💡 Места становится мало. Очистите кэш браузеров, Temp и старые обновления Windows.';
  if (info.usedPercent > 70) return '📦 Диск заметно заполнен. Проверьте папку Загрузки и удалите старые установщики.';
  return '✅ Система выглядит спокойно. Для профилактики запускайте очистку раз в неделю.';
}

ipcMain.handle('get-disk-info', async () => getDiskInfo());

ipcMain.handle('analyze-disk', async () => {
  const started = Date.now();
  const results = getCleanerTargets()
    .map((target) => ({ ...target, sizeBytes: getFolderSize(target.path) }))
    .filter((target) => target.sizeBytes > 0)
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  const totalSize = results.reduce((sum, item) => sum + item.sizeBytes, 0);
  const disk = getDiskInfo();
  return {
    totalSize,
    formatted: formatSize(totalSize),
    results: results.map((item) => ({ ...item, size: formatSize(item.sizeBytes) })),
    disk,
    health: Math.max(25, Math.min(100, disk.freePercent + (totalSize < 1024 * 1024 * 1024 ? 35 : 15))),
    scanTime: `${((Date.now() - started) / 1000).toFixed(1)}с`
  };
});

ipcMain.handle('clean-disk', async () => {
  const started = Date.now();
  const cleanedItems = [];
  let totalCleaned = 0;

  for (const target of getCleanerTargets()) {
    const cleaned = deleteInside(target.path);
    if (cleaned > 0) {
      totalCleaned += cleaned;
      cleanedItems.push({ name: target.name, path: target.path, cleaned: formatSize(cleaned), cleanedBytes: cleaned });
    }
  }

  return {
    formatted: formatSize(totalCleaned),
    totalCleaned,
    cleanedItems,
    itemCount: cleanedItems.length,
    scanTime: `${((Date.now() - started) / 1000).toFixed(1)}с`
  };
});

ipcMain.handle('ai-advice', async () => {
  const disk = getDiskInfo();
  return {
    advice: buildAdvice(disk),
    disk,
    health: Math.max(20, Math.min(100, disk.freePercent + 30))
  };
});

ipcMain.handle('voice-command', async (_event, text = '') => {
  const command = text.toLowerCase();
  if (command.includes('очист')) return { action: 'clean', message: 'Запускаю очистку.' };
  if (command.includes('статус') || command.includes('диск') || command.includes('мест')) return { action: 'status', message: 'Проверяю статус системы.' };
  if (command.includes('совет') || command.includes('рекоменд')) return { action: 'advice', message: 'Готовлю рекомендацию.' };
  if (command.includes('анализ') || command.includes('скан')) return { action: 'analyze', message: 'Начинаю анализ файлов.' };
  if (command.includes('привет') || command.includes('jarvis') || command.includes('джарвис')) return { action: 'greeting', message: 'JARVIS на связи. Отдыхайте — мы всё сделаем.' };
  return { action: 'chat', message: 'Я могу выполнить команды: очисти, статус, совет, анализ.' };
});

ipcMain.handle('ai-chat', async (_event, message = '') => {
  const command = message.toLowerCase();
  if (command.includes('что ты умеешь')) return { response: 'Я умею анализировать мусор, очищать временные файлы, говорить голосом, показывать статус диска и давать советы.' };
  return { response: 'Я вас понял. Для действия скажите: “очисти”, “статус”, “совет” или “анализ”.' };
});

ipcMain.handle('toggle-voice', async (_event, enabled) => {
  voiceEnabled = Boolean(enabled);
  return { enabled: voiceEnabled };
});

function monitorDisk() {
  if (!mainWindow || !voiceEnabled) return;
  const disk = getDiskInfo();
  if (disk.freePercent < 15) {
    const payload = {
      title: 'Богатый курьер Pro',
      body: `На диске C: осталось ${disk.free}. Рекомендую очистку.`
    };
    mainWindow.webContents.send('show-notification', payload);
    mainWindow.webContents.send('speak-text', payload.body);
  }
}

app.whenReady().then(() => {
  createWindow();
  monitorTimer = setInterval(monitorDisk, 5 * 60 * 1000);
});

app.on('window-all-closed', () => {
  if (monitorTimer) clearInterval(monitorTimer);
  if (process.platform !== 'darwin') app.quit();
});
