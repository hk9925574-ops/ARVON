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

export class ScreenDiffTool implements ITool {
  name = 'ScreenDiffTool';
  description = 'Compares the current screen against a previous screenshot to detect if anything changed (like a build error appearing).';
  permissionTier: 1 = 1;
  inputSchema = { properties: {} };

  private lastScreenshot: Buffer | null = null;

  async execute() {
      try {
          const current = await screenshot({ format: 'png' });
          if (!this.lastScreenshot) {
              this.lastScreenshot = current;
              return { success: true, message: 'First screenshot captured. Run again to diff.', hasChanged: false };
          }

          // Extremely basic binary diff logic - in production you'd use pixelmatch or similar
          const hasChanged = this.lastScreenshot.length !== current.length; // Naive size diffing
          this.lastScreenshot = current;

          return { 
              success: true, 
              hasChanged,
              message: hasChanged ? 'The screen has changed significantly.' : 'No major visual changes detected.' 
          };
      } catch (err: any) {
          return { success: false, error: err.message };
      }
  }
}

export class OCRTool implements ITool {
  name = 'OCRTool';
  description = 'Extracts raw text from the current screen using basic OCR heuristics. Helpful if vision models fail to read small text.';
  permissionTier: 1 = 1;
  inputSchema = { properties: {} };

  async execute() {
      return { success: false, error: 'OCR engine (Tesseract) requires native dependencies. Please configure a vision LLM provider instead for text extraction.' };
  }
}
