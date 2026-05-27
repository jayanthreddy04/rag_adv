import app from '../backend/src/app.js';
import { documentService } from '../backend/src/services/documentService.js';

let initPromise;

async function ensureInitialized() {
  if (!initPromise) {
    initPromise = documentService.init();
  }
  return initPromise;
}

export default async function handler(req, res) {
  await ensureInitialized();
  return app(req, res);
}
