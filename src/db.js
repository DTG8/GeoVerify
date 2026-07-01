import fs from 'fs/promises';
import path from 'path';

export class JSONDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  async read() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // If file doesn't exist, create it with empty array
        await this.write([]);
        return [];
      }
      console.error('Error reading database file:', error);
      return [];
    }
  }

  async write(data) {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('Error writing to database file:', error);
      throw error;
    }
  }

  async addVisit(visit) {
    // Chain writes to serialize them and prevent concurrent write collisions
    this.queue = this.queue.then(async () => {
      const visits = await this.read();
      visits.push(visit);
      await this.write(visits);
      return visits;
    });
    return this.queue;
  }

  async clear() {
    this.queue = this.queue.then(async () => {
      await this.write([]);
    });
    return this.queue;
  }

  async updateVisit(id, updatedFields) {
    this.queue = this.queue.then(async () => {
      const visits = await this.read();
      const index = visits.findIndex(v => v.id === id);
      if (index !== -1) {
        visits[index] = { ...visits[index], ...updatedFields };
        await this.write(visits);
        return visits[index];
      }
      return null;
    });
    return this.queue;
  }
}

