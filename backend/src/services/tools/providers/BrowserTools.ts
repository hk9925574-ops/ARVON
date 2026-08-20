import { ITool } from '../ToolRegistry';
import puppeteer, { Browser, Page } from 'puppeteer';

class BrowserManager {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async getPage(): Promise<Page> {
    if (!this.browser) {
      console.log('[ARVON][Browser] Launching Puppeteer...');
      this.browser = await puppeteer.launch({ headless: true });
      this.page = await this.browser.newPage();
      
      // Set a generic user agent
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    }
    return this.page!;
  }
  
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

const sharedBrowser = new BrowserManager();

export class NavigateBrowserTool implements ITool {
  name = 'NavigateBrowserTool';
  description = 'Navigates the internal browser to a specified URL. Use this to start browsing a website.';
  permissionTier: 1 = 1;

  inputSchema = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The absolute URL to navigate to (e.g., https://example.com).' }
    },
    required: ['url']
  };

  async execute(args: { url: string }, config: any) {
    try {
      const page = await sharedBrowser.getPage();
      await page.goto(args.url, { waitUntil: 'networkidle2' });
      const title = await page.title();
      return { success: true, message: `Navigated to ${args.url}. Page title: "${title}". Use ReadPageTool to extract its content.` };
    } catch (e: any) {
      return { success: false, error: `Failed to navigate: ${e.message}` };
    }
  }
}

export class ReadPageTool implements ITool {
  name = 'ReadPageTool';
  description = 'Extracts the visible text content of the page currently open in the internal browser.';
  permissionTier: 1 = 1;

  inputSchema = {
    type: 'object',
    properties: {},
    required: []
  };

  async execute(args: any, config: any) {
    try {
      const page = await sharedBrowser.getPage();
      
      // Extract visible text from the body
      const textContent = await page.evaluate(() => {
        return document.body.innerText;
      });
      
      return { 
        success: true, 
        content: textContent ? textContent.substring(0, 10000) : 'Page has no visible text.' // limit to 10k chars to save context
      };
    } catch (e: any) {
      return { success: false, error: `Failed to read page: ${e.message}` };
    }
  }
}

export class CloseBrowserTool implements ITool {
  name = 'CloseBrowserTool';
  description = 'Closes the internal browser and frees up memory. Call this when you are completely done surfing the web.';
  permissionTier: 1 = 1;

  inputSchema = {
    type: 'object',
    properties: {},
    required: []
  };

  async execute(args: any, config: any) {
    await sharedBrowser.close();
    return { success: true, message: 'Browser closed.' };
  }
}
