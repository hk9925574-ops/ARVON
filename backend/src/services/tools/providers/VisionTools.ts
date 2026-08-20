import { ITool, ToolConfig } from '../ToolRegistry';
import screenshot from 'screenshot-desktop';

export class CaptureScreenTool implements ITool {
  name = 'CaptureScreenTool';
  description = 'Takes a screenshot of the user\'s primary desktop monitor. Use this tool when the user asks what is on their screen, or if they need help navigating a UI.';
  permissionTier: 1 | 2 | 3 = 1;

  inputSchema = {
    type: 'object',
    properties: {
        monitorId: { type: 'string', description: 'Optional ID of the monitor to capture. Leave blank to capture the default primary monitor.' }
    },
    required: []
  };

  async execute(args: any, config: ToolConfig): Promise<any> {
    try {
        const imgBuffer = await screenshot({ format: 'png' });
        const base64Data = imgBuffer.toString('base64');
        return {
            success: true,
            message: 'Screenshot captured successfully. I have attached the image to my context.',
            screenshot: {
                mimeType: 'image/png',
                data: base64Data
            }
        };
    } catch (err: any) {
        return {
            success: false,
            error: `Failed to capture screen: ${err.message}`
        };
    }
  }
}
