import * as fs from 'fs';
import * as path from 'path';

export class TrashManager {
  private trashPath: string;

  constructor(workspacePath: string) {
    this.trashPath = path.join(workspacePath, '.trash');
    if (!fs.existsSync(this.trashPath)) {
      fs.mkdirSync(this.trashPath, { recursive: true });
    }
  }

  public moveToTrash(originalPath: string): string {
    if (!fs.existsSync(originalPath)) {
      throw new Error(`Cannot delete ${originalPath} because it does not exist.`);
    }

    const basename = path.basename(originalPath);
    const timestamp = Date.now();
    const trashFileName = `${timestamp}_${basename}`;
    const destination = path.join(this.trashPath, trashFileName);

    // Save metadata for potential undo
    const metadataPath = destination + '.meta.json';
    fs.writeFileSync(metadataPath, JSON.stringify({ originalPath, timestamp }));

    // Move the actual file/folder
    fs.renameSync(originalPath, destination);

    return destination;
  }
}
