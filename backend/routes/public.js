import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCalendar, loadStandings } from '../services/dataLoader.js';
import { loadVenues, buildVEvent, buildVCalendar } from '../services/icsBuilder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VENUES_PATH = path.resolve(__dirname, '..', 'data', 'venues.json');
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://legirus.sportdata.tech';

const router = express.Router();

router.get('/venues', (_req, res) => {
  try {
    if (!fs.existsSync(VENUES_PATH)) return res.json({ venues: [] });
    res.json(JSON.parse(fs.readFileSync(VENUES_PATH, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Regex [0-9]+ чтобы '/calendar/2010.ics' не съедался в этом роуте
router.get('/calendar/:age([0-9]+)', (req, res) => {
  try {
    const data = loadCalendar(req.params.age);
    if (!data) return res.status(404).json({ error: 'not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/standings/:age([0-9]+)', (req, res) => {
  try {
    const data = loadStandings(req.params.age);
    if (!data) return res.status(404).json({ error: 'not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/calendar/:age.ics', (req, res) => {
  try {
    const age = req.params.age;
    const data = loadCalendar(age);
    if (!data) return res.status(404).type('text/plain').send('not found');
    const venues = loadVenues();
    const ours = (data.matches || []).filter((m) => m.isOurMatch);
    const urlBase = FRONTEND_URL.replace(/\/+$/, '') + '/public/team/' + age;
    const events = ours.map((m) => buildVEvent(m, venues, urlBase)).filter(Boolean);
    const ics = buildVCalendar(events, 'АванDата · Легирус ' + age);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="legirus-' + age + '.ics"');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(ics);
  } catch (e) { res.status(500).type('text/plain').send(e.message); }
});

router.get('/match/:age/:matchId.ics', (req, res) => {
  try {
    const data = loadCalendar(req.params.age);
    if (!data) return res.status(404).type('text/plain').send('not found');
    const match = (data.matches || []).find((m) => m.matchId === req.params.matchId);
    if (!match) return res.status(404).type('text/plain').send('match not found');
    const venues = loadVenues();
    const urlBase = FRONTEND_URL.replace(/\/+$/, '') + '/public/team/' + req.params.age;
    const event = buildVEvent(match, venues, urlBase);
    if (!event) return res.status(400).type('text/plain').send('no date');
    const ics = buildVCalendar([event], 'АванDата · ' + (match.home || '?'));
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="match-' + req.params.matchId + '.ics"');
    res.send(ics);
  } catch (e) { res.status(500).type('text/plain').send(e.message); }
});

export default router;
