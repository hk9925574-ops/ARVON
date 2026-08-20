import { ITool } from '../ToolRegistry';
import { exec } from 'child_process';

export class CalculatorTool implements ITool {
  name = 'CalculatorTool';
  description = 'Evaluates mathematical expressions safely.';
  permissionTier: 1 = 1;
  inputSchema = {
    properties: {
      expression: { type: 'string' }
    },
    required: ['expression']
  };

  async execute(args: { expression: string }, config: any) {
    try {
      // Basic safe evaluation (no complex logic, just math)
      // We will use a safe eval approach or simply let the JS engine handle sanitized math
      const sanitized = args.expression.replace(/[^0-9\+\-\*\/\(\)\.]/g, '');
      if (!sanitized) throw new Error("Invalid characters in math expression");
      
      const result = new Function(`return ${sanitized}`)();
      return { result, original: args.expression };
    } catch (e: any) {
      return { error: `Calculation failed: ${e.message}` };
    }
  }
}

export class OpenWebsiteTool implements ITool {
  name = 'OpenWebsiteTool';
  description = 'Opens a specified URL in the default browser.';
  permissionTier: 1 = 1;
  inputSchema = {
    properties: {
      url: { type: 'string' }
    },
    required: ['url']
  };

  async execute(args: { url: string }, config: any) {
    return new Promise((resolve) => {
      let command = '';
      if (process.platform === 'win32') {
        command = `start ${args.url}`;
      } else if (process.platform === 'darwin') {
        command = `open ${args.url}`;
      } else {
        command = `xdg-open ${args.url}`;
      }

      exec(command, (error) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          resolve({ success: true, message: `Opened ${args.url}` });
        }
      });
    });
  }
}

export class OpenApplicationTool implements ITool {
  name = 'OpenApplicationTool';
  description = 'Attempts to open a local application by name.';
  permissionTier: 1 = 1;
  inputSchema = {
    properties: {
      appName: { type: 'string' }
    },
    required: ['appName']
  };

  async execute(args: { appName: string }, config: any) {
    return new Promise((resolve) => {
      let command = '';
      if (process.platform === 'win32') {
        let app = args.appName.toLowerCase();
        
        // Load custom aliases
        try {
           const fs = require('fs');
           const path = require('path');
           const os = require('os');
           const aliasPath = path.join(os.homedir(), '.arvon_shortcuts.json');
           if (fs.existsSync(aliasPath)) {
               const aliases = JSON.parse(fs.readFileSync(aliasPath, 'utf8'));
               if (aliases[app]) {
                   command = aliases[app]; // Full custom command
               }
           }
        } catch(e){}

        if (!command) {
            if (app === 'telegram') app = 'tg://';
            if (app === 'spotify') app = 'spotify:';
            if (app === 'whatsapp') app = 'whatsapp://';
            if (app === 'mail') app = 'mailto:';
            if (app === 'settings') app = 'ms-settings:';
            command = `start "" "${app}"`;
        }
      } else if (process.platform === 'darwin') {
        command = `open -a "${args.appName}"`;
      } else {
        command = `gtk-launch ${args.appName}`;
      }

      let returned = false;
      exec(command, (error) => {
        if (!returned) {
            returned = true;
            if (error) {
              resolve({ success: false, error: `Failed to open ${args.appName}.` });
            } else {
              resolve({ success: true, message: `Opened application ${args.appName}` });
            }
        }
      });

      // Fire and forget safety hatch to prevent hanging on Windows GUI error modals
      setTimeout(() => {
        if (!returned) {
            returned = true;
            resolve({ success: true, message: `Command dispatched for ${args.appName}.` });
        }
      }, 1500);
    });
  }
}

import { spawn } from 'child_process';

export class RunCommandTool implements ITool {
  name = 'RunCommandTool';
  description = 'Executes a command or script in the terminal. Use this to run code, compile software, or execute bash/powershell scripts.';
  permissionTier: 3 = 3; // Requires user confirmation!
  
  inputSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The terminal command to execute.' },
      cwd: { type: 'string', description: 'Optional. The working directory to execute the command in.' }
    },
    required: ['command']
  };

  constructor(private onTerminalOutput: (chunk: string, command: string) => void = () => {}) {}

  async execute(args: { command: string; cwd?: string }, config: any) {
    return new Promise((resolve) => {
      this.onTerminalOutput(`\x1b[32m$ ${args.command}\x1b[0m\n`, args.command);
      
      const child = spawn(args.command, { 
          cwd: args.cwd || config.workspacePath,
          shell: true
      });

      let fullStdout = '';
      let fullStderr = '';

      child.stdout.on('data', (data) => {
          const chunk = data.toString();
          fullStdout += chunk;
          this.onTerminalOutput(chunk, args.command);
      });

      child.stderr.on('data', (data) => {
          const chunk = data.toString();
          fullStderr += chunk;
          this.onTerminalOutput(chunk, args.command);
      });

      child.on('error', (err) => {
          this.onTerminalOutput(`\x1b[31mError: ${err.message}\x1b[0m\n`, args.command);
          resolve({
              success: false,
              stdout: fullStdout,
              stderr: fullStderr,
              error: err.message
          });
      });

      child.on('close', (code) => {
          this.onTerminalOutput(`\n\x1b[90m[Process exited with code ${code}]\x1b[0m\n\n`, args.command);
          resolve({
            success: code === 0,
            stdout: fullStdout,
            stderr: fullStderr,
            error: code !== 0 ? `Exited with code ${code}` : null
          });
      });
    });
  }
}

export class ReadClipboardTool implements ITool {
  name = 'ReadClipboardTool';
  description = 'Reads the current text contents of the system clipboard. Use this when the user says "what is this?" or "fix what I just copied".';
  permissionTier: 1 | 2 | 3 = 1;
  inputSchema = { properties: {} };

  async execute() {
    return new Promise((resolve) => {
      let command = 'powershell.exe -Command Get-Clipboard';
      if (process.platform === 'darwin') command = 'pbpaste';
      if (process.platform === 'linux') command = 'xclip -selection clipboard -o';

      exec(command, (error, stdout) => {
        if (error) {
          resolve({ success: false, error: 'Could not read clipboard' });
        } else {
          resolve({ success: true, clipboardContent: stdout.trim() });
        }
      });
    });
  }
}

export class GitContextTool implements ITool {
  name = 'GitContextTool';
  description = 'Reads the current git branch, status, and diff to answer questions about the workspace state without needing code pasted in.';
  permissionTier: 1 | 2 | 3 = 1;
  inputSchema = {
    type: 'object',
    properties: {
        cwd: { type: 'string', description: 'The repository directory to check. Must be absolute path.' }
    },
    required: ['cwd']
  };

  async execute(args: { cwd: string }) {
    return new Promise((resolve) => {
      exec('git status -s && echo "---" && git diff', { cwd: args.cwd }, (error, stdout, stderr) => {
         if (error) {
             resolve({ success: false, error: stderr || error.message });
         } else {
             resolve({ success: true, gitContext: stdout.trim() });
         }
      });
    });
  }
}
