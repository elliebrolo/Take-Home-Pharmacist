import express from 'express';
import type { Deps } from '../core/deps.ts';
import { audit } from '../core/db.ts';
import { ConsultationStore, HttpError } from '../core/consultations.ts';
import { rateLimit, requireRole } from '../core/auth.ts';
import { handleChatTurn, history, queueReview } from '../chat/service.ts';
import { checkFood } from '../chat/food.ts';

const wrap = (fn: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error(e);
    if (res.headersSent) { res.write(`data: ${JSON.stringify({ type: 'error', error: 'Something went wrong.' })}\n\n`); return res.end(); }
    res.status(500).json({ error: 'Something went wrong on the server.' });
  }
};

/**
 * Patient chat and food check. The regimen is always loaded server-side from the
 * signed-in patient's approved record; request bodies carry only the question.
 */
export function registerChatRoutes(app: express.Express, deps: Deps) {
  const limit = rateLimit(20, 60 * 1000);
  const patient = requireRole('patient');

  app.post('/api/patient-chat', patient, limit, wrap(async (req, res) => {
    const r = await handleChatTurn(deps, req.session!.sub, req.body?.message);
    res.json({ success: true, text: r.text, kind: r.kind, level: r.level, citations: r.citations, triage: r.triage, messageId: r.messageId });
  }));

  // Streams the already-validated answer. Model output is never streamed raw: it is checked first.
  app.post('/api/patient-chat-stream', patient, limit, wrap(async (req, res) => {
    const r = await handleChatTurn(deps, req.session!.sub, req.body?.message);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: 'start', triage: r.triage, kind: r.kind, level: r.level })}\n\n`);
    const words = r.text.split(' ');
    for (let i = 0; i < words.length; i += 5) {
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: words.slice(i, i + 5).join(' ') + ' ' })}\n\n`);
      await new Promise((ok) => setTimeout(ok, 15));
    }
    res.write(`data: ${JSON.stringify({ type: 'done', kind: r.kind, citations: r.citations, messageId: r.messageId })}\n\n`);
    res.end();
  }));

  // Conversation history, including replies a pharmacist has written since.
  app.get('/api/chat/messages', patient, (req, res) => {
    const after = Math.max(0, parseInt(String(req.query.after ?? '0'), 10) || 0);
    res.json({ messages: history(deps, req.session!.sub, after) });
  });

  app.post('/api/check-food-interaction', patient, limit, wrap(async (req, res) => {
    const food = req.body?.foodItem;
    if (typeof food !== 'string' || !food.trim() || food.length > 80) throw new HttpError(400, 'Enter a food or drink (up to 80 characters).');
    const record = new ConsultationStore(deps.db).approvedFor(req.session!.sub);
    if (!record) throw new HttpError(404, 'No approved consultation on file.');
    const result = await checkFood(food.trim(), record, deps.knowledge);
    if (result.verdict === 'unknown') queueReview(deps, req.session!.sub, 'needs_pharmacist', `Food check with no source: ${food.trim()}`, { food: food.trim() });
    audit(deps.db, `patient:${req.session!.sub}`, 'food.check', undefined, { food: food.trim(), verdict: result.verdict });
    res.json({ success: true, result });
  }));
}
