import { ITool, ToolConfig } from '../ToolRegistry';
import * as fs from 'fs';
import * as path from 'path';
import { TrashManager } from '../TrashManager';

function isPathRestricted(target: string, restrictedPaths: string[]): boolean {
  const normTarget = path.normalize(target).toLowerCase();
  for (const restricted of restrictedPaths) {
    if (normTarget.startsWith(path.normalize(restricted).toLowerCase())) {
      return true;
    }
  }
  return false;
}

function isPathAllowed(target: string, allowedPaths: string[]): boolean {
  const normTarget = path.normalize(target).toLowerCase();
  for (const allowed of allowedPaths) {
    if (normTarget.startsWith(path.normalize(allowed).toLowerCase())) {
      return true;
    }
  }
  return false;
}

function isWorkspacePath(target: string, workspacePath: string): boolean {
  const normTarget = path.normalize(target).toLowerCase();
  return normTarget.startsWith(path.normalize(workspacePath).toLowerCase());
}

export class ReadFSTool implements ITool {
  name = 'ReadFSTool';
  description = 'Reads a file or lists a directory. Path must be within ALLOWED_PATHS.';
  permissionTier: 1 = 1;
  inputSchema = { properties: { path: { type: 'string' } }, required: ['path'] };

  async execute(args: { path: string }, config: ToolConfig) {
    if (isPathRestricted(args.path, config.restrictedPaths)) {
      throw new Error(`Path ${args.path} is highly restricted.`);
    }
    if (!isPathAllowed(args.path, config.allowedPaths) && !isWorkspacePath(args.path, config.workspacePath)) {
      throw new Error(`Path ${args.path} is outside allowed directories.`);
    }

    const stat = fs.statSync(args.path);
    if (stat.isDirectory()) {
      return { type: 'directory', contents: fs.readdirSync(args.path) };
    } else {
      return { type: 'file', contents: fs.readFileSync(args.path, 'utf8') };
    }
  }
}

export interface UndoAction {
    description: string;
    undo: () => Promise<void>;
}

export class UndoManager {
    static log: UndoAction[] = [];
    static push(action: UndoAction) {
       this.log.push(action);
       if(this.log.length > 50) this.log.shift();
    }
    static async pop() {
        const last = this.log.pop();
        if(last) {
            await last.undo();
            return last.description;
        }
        return null;
    }
}

export class UndoTool implements ITool {
  name = 'UndoTool';
  description = 'Reverts the most recent file system change (create, write, delete) made by ARVON.';
  permissionTier: 1 = 1;
  inputSchema = { properties: {} };

  async execute(args: any, config: ToolConfig) {
      const description = await UndoManager.pop();
      if (description) {
          return { success: true, message: `Successfully reverted action. Reverse executed: ${description}` };
      } else {
          return { success: false, error: 'No recent actions found in the undo log to revert.' };
      }
  }
}

export class WriteWorkspaceTool implements ITool {
  name = 'WriteWorkspaceTool';
  description = 'Creates or modifies files inside the ARVON workspace. Modifies outside workspace will trigger Tier 3 confirmation.';
  permissionTier: 2 = 2; // Dynamic escalation to 3 implemented in execute
  inputSchema = { properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] };

  async execute(args: { path: string, content: string }, config: ToolConfig) {
    if (isPathRestricted(args.path, config.restrictedPaths)) {
      throw new Error(`Path ${args.path} is highly restricted.`);
    }
    
    if (!isWorkspacePath(args.path, config.workspacePath)) {
        throw new Error(`WriteWorkspaceTool can only write to the ARVON workspace. Use ModifySystemTool for outside writes.`);
    }

    const dir = path.dirname(args.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const fileExists = fs.existsSync(args.path);
    let previousContent = '';
    if (fileExists) {
        previousContent = fs.readFileSync(args.path, 'utf8');
    }

    UndoManager.push({
        description: fileExists ? `Restore previous content of ${args.path}` : `Delete newly created file ${args.path}`,
        undo: async () => {
            if (fileExists) fs.writeFileSync(args.path, previousContent);
            else fs.unlinkSync(args.path);
        }
    });

    fs.writeFileSync(args.path, args.content);
    return { success: true, message: `Wrote to ${args.path}` };
  }
}

export class ModifySystemTool implements ITool {
  name = 'ModifySystemTool';
  description = 'Deletes, overwrites, or modifies files outside the workspace. High blast radius.';
  permissionTier: 3 = 3;
  inputSchema = { properties: { action: { type: 'string' }, targetPath: { type: 'string' }, destinationPath: { type: 'string' }, content: { type: 'string' } }, required: ['action', 'targetPath'] };

  async execute(args: { action: string, targetPath: string, destinationPath?: string, content?: string }, config: ToolConfig) {
    if (isPathRestricted(args.targetPath, config.restrictedPaths)) {
      throw new Error(`Target path ${args.targetPath} is restricted.`);
    }
    if (args.destinationPath && isPathRestricted(args.destinationPath, config.restrictedPaths)) {
      throw new Error(`Destination path ${args.destinationPath} is restricted.`);
    }

    const trash = new TrashManager(config.workspacePath);

    if (args.action === 'delete') {
       const backupPath = trash.moveToTrash(args.targetPath);
       if (backupPath) {
           UndoManager.push({
               description: `Restore deleted file ${args.targetPath} from trash`,
               undo: async () => { fs.copyFileSync(backupPath, args.targetPath); }
           });
       }
       return { success: true, message: `Moved ${args.targetPath} to trash.` };
    } 
    else if (args.action === 'move' && args.destinationPath) {
       fs.renameSync(args.targetPath, args.destinationPath);
       const target = args.targetPath;
       const dest = args.destinationPath;
       UndoManager.push({
           description: `Move ${dest} back to ${target}`,
           undo: async () => { fs.renameSync(dest, target); }
       });
       return { success: true, message: `Moved to ${args.destinationPath}` };
    }
    else if (args.action === 'write' && args.content !== undefined) {
       const fileExists = fs.existsSync(args.targetPath);
       let backupPath: string | null = null;
       if (fileExists) {
           const tempBackupPath = path.join(path.dirname(args.targetPath), path.basename(args.targetPath) + '.bak');
           fs.copyFileSync(args.targetPath, tempBackupPath);
           backupPath = trash.moveToTrash(tempBackupPath);
       } else {
           const dir = path.dirname(args.targetPath);
           if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
       }
       
       const target = args.targetPath;
       UndoManager.push({
           description: fileExists ? `Restore ${target} from trash backup` : `Delete newly created ${target}`,
           undo: async () => {
               if (fileExists && backupPath) {
                   fs.copyFileSync(backupPath, target);
               } else if (!fileExists) {
                   fs.unlinkSync(target);
               }
           }
       });

       fs.writeFileSync(args.targetPath, args.content);
       return { success: true, message: `Wrote to ${args.targetPath}` };
    }
    
    throw new Error(`Invalid action or missing parameters for ModifySystemTool`);
  }
}
