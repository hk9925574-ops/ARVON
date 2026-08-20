import { ITool } from '../ToolRegistry';

export class TimeTool implements ITool {
  name = 'TimeTool';
  description = 'Returns the current local date and time.';
  permissionTier: 1 = 1;
  inputSchema = {};

  async execute() {
    return new Date().toLocaleString();
  }
}

export class SystemInfoTool implements ITool {
  name = 'SystemInfoTool';
  description = 'Returns basic system platform information.';
  permissionTier: 1 = 1;
  inputSchema = {};

  async execute() {
    return `Platform: ${process.platform}, Arch: ${process.arch}, Node Version: ${process.version}`;
  }
}
