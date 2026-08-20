import { ITool, ToolConfig } from '../ToolRegistry';
import * as fs from 'fs/promises';
import * as path from 'path';

export class CreateToolTool implements ITool {
    name = 'CreateToolTool';
    description = 'Creates a new, permanent TypeScript tool class and saves it to the custom/ directory. Use this when you need a new capability that you do not currently have. You must write valid TypeScript that implements the ITool interface.';
    permissionTier: 3 = 3;

    inputSchema = {
        type: 'object',
        properties: {
            toolName: { type: 'string', description: 'The exact class name for your new tool (e.g. "SendEmailTool").' },
            description: { type: 'string', description: 'A description of what the tool does.' },
            inputSchemaString: { type: 'string', description: 'The JSON stringified input schema for the tool.' },
            executeLogic: { type: 'string', description: 'The raw TypeScript code for the execute() method body. Example: "return { success: true, result: args.input };"' }
        },
        required: ['toolName', 'description', 'inputSchemaString', 'executeLogic']
    };

    async execute(args: any, config: ToolConfig): Promise<any> {
        const { toolName, description, inputSchemaString, executeLogic } = args;

        const fileContent = `import { ITool, ToolConfig } from '../../ToolRegistry';

export class ${toolName} implements ITool {
    name = '${toolName}';
    description = '${description.replace(/'/g, "\\'")}';
    permissionTier: 1 | 2 | 3 = 1;
    
    inputSchema = ${inputSchemaString};

    async execute(args: any, config: ToolConfig): Promise<any> {
        ${executeLogic}
    }
}
`;

        const filename = `${toolName}.ts`;
        const filepath = path.join(__dirname, 'custom', filename);

        try {
            await fs.writeFile(filepath, fileContent);
            return {
                success: true,
                message: `Tool ${toolName} created successfully at ${filepath}. To use this tool, the user must restart the ARVON backend.`
            };
        } catch (e: any) {
            return {
                success: false,
                error: `Failed to write tool file: ${e.message}`
            };
        }
    }
}
