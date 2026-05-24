// DEPRECATED — route /api/agent отключён в Sprint 2 cleanup.
// Не монтируется в server.js. Файл-stub для совместимости импортов.
import express from 'express';
const router = express.Router();
router.all('*', (_req, res) => res.status(410).json({ error: 'Agent endpoint removed' }));
export default router;
