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

export class WriteWorkspaceTool implements ITool {
  name = 'WriteWorkspaceTool';
  description = 'Creates or modifies files inside the ARVON workspace. Modifies outside workspace will trigger Tier 3 confirmation.';
  permissionTier: 2 = 2; // Dynamic escalation to 3 implemented in execute
  inputSchema = { properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] };

  async execute(args: { path: string, content: string }, config: ToolConfig) {
    if (isPathRestricted(args.path, config.restrictedPaths)) {
      throw new Error(`Path ${args.path} is highly restricted.`);
    }
    
    // Dynamic tier escalation handled by ToolEngine based on path check in orchestrator?
    // Actually, ToolRegistry relies on the static `permissionTier` property.
    // If we want dynamic escalation, we can throw a special error or we just set this tool to Tier 3 if we want to be safe.
    // But the requirements state Tier 2 is for workspace. Let's make this tool strictly for workspace.
    if (!isWorkspacePath(args.path, config.workspacePath)) {
        throw new Error(`WriteWorkspaceTool can only write to the ARVON workspace. Use ModifySystemTool for outside writes.`);
    }

    const dir = path.dirname(args.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
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
       trash.moveToTrash(args.targetPath);
       return { success: true, message: `Moved ${args.targetPath} to trash.` };
    } 
    else if (args.action === 'move' && args.destinationPath) {
       fs.renameSync(args.targetPath, args.destinationPath);
       return { success: true, message: `Moved to ${args.destinationPath}` };
    }
    else if (args.action === 'write' && args.content !== undefined) {
       if (fs.existsSync(args.targetPath)) {
           // Backup existing to trash before overwrite
           const backupPath = path.join(path.dirname(args.targetPath), path.basename(args.targetPath) + '.bak');
           fs.copyFileSync(args.targetPath, backupPath);
           trash.moveToTrash(backupPath);
       } else {
           const dir = path.dirname(args.targetPath);
           if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
       }
       fs.writeFileSync(args.targetPath, args.content);
       return { success: true, message: `Wrote to ${args.targetPath}` };
    }
    
    throw new Error(`Invalid action or missing parameters for ModifySystemTool`);
  }
}
