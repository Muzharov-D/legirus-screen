import express from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { processPdf } from '../services/pdfParser.js';

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

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не передан (поле file)' });

    // teamId — из form-data; для team_coach должен совпадать с собственной
    // привязкой, для head_coach допустима любая команда.
    const teamId = req.body.teamId || req.user?.teamId || null;
    if (!teamId) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'teamId обязателен' });
    }
    if (req.user?.role === 'team_coach' && req.user.teamId !== teamId) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'Можно загружать только для своей команды' });
    }

    const tournamentRaw = (req.body.tournament || 'league').toLowerCase();
    const tournament = ['league', 'cup'].includes(tournamentRaw) ? tournamentRaw : 'league';

    const result = await processPdf(req.file.path, { teamId, tournament });
    fs.unlink(req.file.path, () => {});
    res.json(result);
  } catch (e) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: e.message });
  }
});

export default router;
