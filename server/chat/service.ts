import type { Deps } from '../core/deps.ts';
import { audit } from '../core/db.ts';
import { ConsultationStore, HttpError } from '../core/consultations.ts';
import type { EmergencyTriageResult } from '../../src/types/pharmacy.ts';
import { answerFromSources } from './answer.ts';
import { EMERGENCY_TEXT, FORWARDED_TEXT, UNAVAILABLE_TEXT, UNSUPPORTED_TEXT, URGENT_TEXT, triagePayload } from './fixedText.ts';
import { classify, type TriageLevel } from './triage.ts';
import type { Citation } from './validate.ts';

export type ChatKind = 'answer' | 'emergency' | 'urgent' | 'forwarded' | 'fallback' | 'refused' | 'human';
export interface ChatReply {
  level: TriageLevel;
  kind: ChatKind;
  text: string;
  citations: Citation[];
  triage: EmergencyTriageResult | null;
  messageId: number;
}

const MAX_MESSAGE = 1000;
const PRIORITY: Record<string, number> = { emergency: 1, urgent: 2, needs_pharmacist: 3, validation_failed: 4, llm_unavailable: 4, audit: 5 };

export function queueReview(deps: Deps, patientId: string, reason: string, question: string, detail: unknown): number {
  const priority = PRIORITY[reason] ?? 4;
  const r = deps.db
    .prepare('INSERT INTO review_items (patient_id, reason, priority, question, detail, created_at) VALUES (?,?,?,?,?,?)')
    .run(patientId, reason, priority, question, JSON.stringify(detail ?? null), new Date().toISOString());
  const itemId = Number(r.lastInsertRowid);
  try {
    deps.notify?.({ itemId, reason, priority });
  } catch {
    /* a failing notifier must never fail the patient's request */
  }
  return itemId;
}

function store(deps: Deps, patientId: string, sender: string, kind: string, text: string, citations?: Citation[]): number {
  const r = deps.db
    .prepare('INSERT INTO chat_messages (patient_id, sender, kind, text, citations, created_at) VALUES (?,?,?,?,?,?)')
    .run(patientId, sender, kind, text, citations?.length ? JSON.stringify(citations) : null, new Date().toISOString());
  return Number(r.lastInsertRowid);
}

export function history(deps: Deps, patientId: string, afterId = 0, limit = 100) {
  return (deps.db.prepare('SELECT * FROM chat_messages WHERE patient_id=? AND id>? ORDER BY id ASC LIMIT ?').all(patientId, afterId, limit) as any[]).map((r) => ({
    id: r.id as number,
    sender: r.sender as string,
    kind: r.kind as string,
    text: r.text as string,
    citations: r.citations ? (JSON.parse(r.citations) as Citation[]) : [],
    createdAt: r.created_at as string,
  }));
}

/** One patient turn: triage first, then (only if routine) a grounded, validated answer. */
export async function handleChatTurn(deps: Deps, patientId: string, rawMessage: unknown): Promise<ChatReply> {
  if (typeof rawMessage !== 'string' || !rawMessage.trim()) throw new HttpError(400, 'Message is required.');
  const message = rawMessage.trim();
  if (message.length > MAX_MESSAGE) throw new HttpError(400, `Please keep your message under ${MAX_MESSAGE} characters.`);

  const record = new ConsultationStore(deps.db).approvedFor(patientId);
  if (!record) throw new HttpError(404, 'No approved consultation on file.');
  const contact = { pharmacyName: record.pharmacyName, pharmacyPhone: record.pharmacyPhone };

  const prior = history(deps, patientId, 0, 200)
    .filter((m) => m.sender === 'patient' || m.sender === 'assistant' || m.sender === 'pharmacist')
    .slice(-8)
    .map((m) => ({ role: (m.sender === 'patient' ? 'patient' : 'assistant') as 'patient' | 'assistant', text: m.text }));
  store(deps, patientId, 'patient', 'question', message);

  const regimenSummary = record.medications.map((m) => `${m.medicationName} ${m.strength}`).join('; ');
  const triage = await classify({ message, history: prior, regimenSummary, llm: deps.llm });
  const actor = `patient:${patientId}`;
  audit(deps.db, actor, 'chat.triage', undefined, { level: triage.level, category: triage.category, signals: triage.signals });

  const reply = (kind: ChatKind, text: string, citations: Citation[] = []): ChatReply => ({
    level: triage.level,
    kind,
    text,
    citations,
    triage: triagePayload(triage.level, contact, text),
    messageId: store(deps, patientId, 'assistant', kind, text, citations),
  });

  if (triage.level === 'emergency') {
    queueReview(deps, patientId, 'emergency', message, { triage });
    return reply('emergency', EMERGENCY_TEXT(contact));
  }
  if (triage.level === 'urgent') {
    queueReview(deps, patientId, 'urgent', message, { triage });
    return reply('urgent', URGENT_TEXT(contact));
  }
  if (triage.level === 'needs_pharmacist') {
    queueReview(deps, patientId, 'needs_pharmacist', message, { triage });
    return reply('forwarded', FORWARDED_TEXT(contact));
  }

  if (!deps.llm) {
    queueReview(deps, patientId, 'llm_unavailable', message, { triage, error: 'no model configured' });
    return reply('fallback', UNAVAILABLE_TEXT(contact));
  }
  const out = await answerFromSources({ question: message, history: prior, record, knowledge: deps.knowledge, llm: deps.llm });
  if (out.kind === 'unavailable') {
    queueReview(deps, patientId, 'llm_unavailable', message, { triage, error: out.error });
    return reply('fallback', UNAVAILABLE_TEXT(contact));
  }
  if (out.kind === 'rejected') {
    // The rejected draft goes to the pharmacist, never to the patient.
    queueReview(deps, patientId, 'validation_failed', message, { triage, reasons: out.reasons, draft: out.draft, attempts: out.attempts });
    return reply('refused', UNSUPPORTED_TEXT(contact));
  }
  if (deps.random() < deps.auditRate) queueReview(deps, patientId, 'audit', message, { answer: out.text, citations: out.citations });
  return reply('answer', out.text, out.citations);
}
