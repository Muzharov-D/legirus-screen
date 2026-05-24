import express from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { processPdf } from '../services/pdfParser.js';
import { notifyMatchProcessed } from '../services/pushService.js';
import { loadMatchesIndex } from '../services/dataLoader.js';

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(os.tmpdir(), 'legirus-uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const stamp = Date.now();
      cb(null, `upload-${stamp}-${file.originalname.replace(/[^\w.-]/g, '_')}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    cb(ok ? null : new Error('Принимаются только PDF файлы'), ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Удаление multer temp-файла с логом при ошибке (без unlink-callback всё
// падает молча и /tmp может расти бесконечно).
function cleanupUpload(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('[upload] cleanup failed:', filePath, err.message);
    }
  });
}

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не передан (поле file)' });

    // teamId — из form-data; для team_coach должен совпадать с собственной
    // привязкой, для head_coach допустима любая команда.
    const teamId = req.body.teamId || req.user?.teamId || null;
    if (!teamId) {
      cleanupUpload(req.file.path);
      return res.status(400).json({ error: 'teamId обязателен' });
    }
    if (req.user?.role === 'team_coach' && req.user.teamId !== teamId) {
      cleanupUpload(req.file.path);
      return res.status(403).json({ error: 'Можно загружать только для своей команды' });
    }

    const tournamentRaw = (req.body.tournament || 'league').toLowerCase();
    const tournament = ['league', 'cup'].includes(tournamentRaw) ? tournamentRaw : 'league';

    const result = await processPdf(req.file.path, { teamId, tournament });
    cleanupUpload(req.file.path);

    // Push-уведомление о новом разборе матча — fire-and-forget, не должно ломать ответ.
    try {
      const matchId = result?.matchId || result?.id || result?.match?.id;
      if (matchId) {
        const idx = loadMatchesIndex();
        const match = (idx.matches || []).find((m) => m.id === matchId);
        if (match) {
          notifyMatchProcessed(match)
            .then((r) => console.log(`[push] match ${matchId}: sent=${r.sent}, failed=${r.failed}`))
            .catch((e) => console.error('[push] notify ошибка:', e.message));
        }
      }
    } catch (notifyErr) {
      console.error('[push] не удалось отправить уведомление:', notifyErr.message);
    }

    res.json(result);
  } catch (e) {
    cleanupUpload(req.file?.path);
    res.status(500).json({ error: e.message });
  }
});

export default router;
