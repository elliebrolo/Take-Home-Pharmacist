import { apiFetch } from '../utils/api';
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { Send, AlertTriangle, Phone, MapPin, Sparkles, ShieldAlert, HeartPulse, UserCheck, FileText } from 'lucide-react';
import { ConsultationRecord, ChatMessage, ChatCitation, EmergencyTriageResult } from '../types/pharmacy';
import { notificationService } from '../utils/audioNotification';
import { PictorialWarningLabel, detectMedicationPictorials } from './PictorialWarningLabel';
import { ChatMarkdown } from './ChatMarkdown';

interface PatientChatbotProps {
  consultation: ConsultationRecord;
  onOpenEmergencyModal: (triage?: EmergencyTriageResult) => void;
}

export const PatientChatbot: React.FC<PatientChatbotProps> = ({
  consultation,
  onOpenEmergencyModal,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'pharmacist_ai',
      text: `Hello ${consultation.patientName}. I am an AI assistant, not a pharmacist. I answer only from the notes of your pharmacist visit on ${consultation.consultationDate} and from the official drug label, and I show where each answer comes from.\n\nI can't tell you to stop or change a medicine. Questions like that go to your pharmacist. If you feel very unwell, tap the red help button or call 911.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Scroll the conversation only. (scrollIntoView would also move the whole page.)
  const scrollToBottom = () => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  // Fill the space between the tabs above and the page footer below. Measured rather than hard-coded
  // because the welcome banner, tab bar and footer change height with screen width and text size.
  // Never smaller than MIN_CHAT_HEIGHT: on a short screen the page scrolls instead.
  const MIN_CHAT_HEIGHT = 420;
  const [cardHeight, setCardHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const card = cardRef.current;
      if (!card) return;
      const top = card.getBoundingClientRect().top + window.scrollY;
      const footerH = document.querySelector('footer')?.getBoundingClientRect().height ?? 0;
      // Everything between the card and the footer (the main area's padding and anything the page renders
      // below the chat) has to fit above the footer too, so measure it instead of assuming it.
      const main = card.closest('main');
      const mainBottom = main ? main.getBoundingClientRect().bottom : card.getBoundingClientRect().bottom;
      const below = Math.max(0, mainBottom - card.getBoundingClientRect().bottom);
      const room = window.innerHeight - top - footerH - below;
      setCardHeight(Math.max(MIN_CHAT_HEIGHT, Math.floor(room)));
    };
    fit();
    window.addEventListener('resize', fit);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(document.body); // banner/tab wrapping or footer changes
    return () => {
      window.removeEventListener('resize', fit);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const lastServerId = useRef(0);

  // Restore the saved conversation, and pick up replies a pharmacist writes later.
  useEffect(() => {
    let cancelled = false;
    const toLocal = (m: any): ChatMessage => ({
      id: `srv-${m.id}`,
      sender: m.sender === 'patient' ? 'user' : m.sender === 'pharmacist' ? 'pharmacist' : 'pharmacist_ai',
      kind: m.kind,
      text: m.text,
      citations: m.citations,
      timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    const load = async (initial: boolean) => {
      try {
        const r = await apiFetch(`/api/chat/messages?after=${lastServerId.current}`);
        if (!r.ok || cancelled) return;
        const { messages: rows } = await r.json();
        if (!rows.length) return;
        lastServerId.current = Math.max(lastServerId.current, ...rows.map((m: any) => m.id));
        if (initial) setMessages((prev) => [prev[0], ...rows.map(toLocal)]);
        else {
          const human = rows.filter((m: any) => m.sender === 'pharmacist');
          if (human.length) setMessages((prev) => [...prev, ...human.map(toLocal)]);
        }
      } catch {
        /* offline: try again on the next poll */
      }
    };
    load(true);
    const timer = setInterval(() => load(false), 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Suggestions come from this patient's own medicines, not a fixed list.
  const quickPrompts = useMemo(() => {
    const perMedicine = consultation.medications
      .slice(0, 2)
      .map((m) => `When should I take ${m.medicationName}?`);
    return [...perMedicine, 'What foods should I avoid?', 'What side effects should I watch for?'];
  }, [consultation.medications]);

  const handleSendMessage = async (textToSend?: string) => {
    const userText = (textToSend || input).trim();
    if (!userText || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const aiMsgId = `ai-${Date.now()}`;
    const initialAiMessage: ChatMessage = {
      id: aiMsgId,
      sender: 'pharmacist_ai',
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage, initialAiMessage]);
    setInput('');
    setIsLoading(true);
    setStreamingMsgId(aiMsgId);

    let streamStarted = false;
    try {
      // The server checks the answer before sending it, so text arrives only after it has been validated.
      const response = await apiFetch('/api/patient-chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });

      if (response.status === 401) throw new Error('signed-out');
      if (!response.ok || !response.body) {
        throw new Error('Streaming not available, falling back to instant JSON');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';
      streamStarted = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payloadStr = trimmed.slice(6).trim();
          if (!payloadStr) continue;

          try {
            const payload = JSON.parse(payloadStr);

            if (payload.type === 'start') {
              streamStarted = true;
              const triage = payload.triage;
              if (triage?.isUrgent) {
                notificationService.playEmergencyAlertTone();
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId
                      ? { ...m, isEmergencyAlert: true, triageData: triage }
                      : m
                  )
                );
              }
            } else if (payload.type === 'chunk') {
              accumulatedText += payload.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId ? { ...m, text: accumulatedText } : m
                )
              );
            } else if (payload.type === 'done') {
              if (payload.messageId) lastServerId.current = Math.max(lastServerId.current, payload.messageId);
              setMessages((prev) => prev.map((m) => (m.id === aiMsgId ? { ...m, kind: payload.kind, citations: payload.citations } : m)));
            } else if (payload.type === 'error') {
              throw new Error(payload.error || 'Server stream error');
            }
          } catch (parseErr) {
            // continue processing subsequent chunks
          }
        }
      }
    } catch (streamErr) {
      if (streamStarted || (streamErr as Error)?.message === 'signed-out') {
        // The server already handled this question (or the session ended); asking again would duplicate it.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId && !m.text
              ? { ...m, text: (streamErr as Error)?.message === 'signed-out' ? 'Your session ended. Please sign in again.' : 'The connection dropped. Please check the conversation again in a moment, or call your pharmacy.' }
              : m
          )
        );
        return;
      }
      try {
        const response = await apiFetch('/api/patient-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userText }),
        });

        const data = await response.json();
        if (data.success) {
          if (data.messageId) lastServerId.current = Math.max(lastServerId.current, data.messageId);
          const triage = data.triage;
          if (triage?.isUrgent) {
            notificationService.playEmergencyAlertTone();
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    text: data.text,
                    kind: data.kind,
                    citations: data.citations,
                    isEmergencyAlert: triage?.isUrgent,
                    triageData: triage,
                  }
                : m
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    text: `I can't answer that right now. Please call your pharmacy on ${consultation.pharmacyPhone}. If this is an emergency, call 911.`,
                  }
                : m
            )
          );
        }
      } catch (err: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  text: `Network problem. Please check your connection, or call your pharmacy on ${consultation.pharmacyPhone}.`,
                }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      setStreamingMsgId(null);
    }
  };


  return (
    <div
      ref={cardRef}
      style={{ height: cardHeight ?? 700 }}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden"
    >
      {/* Chat Header */}
      <div className="shrink-0 p-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 text-sm font-extrabold"
          >
            AI
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">AI assistant (not a pharmacist)</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Answers come from your {consultation.consultationDate} visit notes and the FDA drug label. It can be wrong.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenEmergencyModal()}
          className="min-h-11 flex items-center gap-1.5 px-4 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-800 dark:text-rose-200 text-sm font-bold rounded-lg transition-colors border border-rose-300 dark:border-rose-800"
        >
          <ShieldAlert className="w-5 h-5 text-rose-600" aria-hidden="true" />
          Get urgent help
        </button>
      </div>

      {/* Messages */}
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 min-h-0 p-4 overflow-y-auto overscroll-contain space-y-4"
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.sender === 'pharmacist' && (
              <div
                aria-hidden="true"
                className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-800 dark:text-emerald-300 shrink-0 mt-1"
              >
                <UserCheck className="w-5 h-5" />
              </div>
            )}
            {msg.sender === 'pharmacist_ai' && (
              <div
                aria-hidden="true"
                className="w-9 h-9 rounded-full bg-teal-100 dark:bg-teal-950 flex items-center justify-center text-teal-800 dark:text-teal-300 shrink-0 text-sm font-bold mt-1"
              >
                AI
              </div>
            )}

            <div className={`max-w-[88%] ${msg.sender === 'user' ? 'order-1' : 'order-2'}`}>
              {/* Safety warning comes FIRST, before any explanation */}
              {msg.isEmergencyAlert && msg.triageData && (
                <div
                  role="alert"
                  className="mb-2 p-4 bg-rose-50 dark:bg-rose-950/80 border-2 border-rose-500 dark:border-rose-600 rounded-2xl space-y-3 shadow-sm"
                >
                  <div className="flex items-start gap-2.5 text-rose-950 dark:text-rose-50 leading-relaxed">
                    <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <span className="block uppercase tracking-wider text-sm text-rose-800 dark:text-rose-300 font-extrabold mb-0.5">
                        Get help now
                      </span>
                      <span className="text-base font-bold">{msg.triageData.patientInstruction}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href="tel:911"
                      className="min-h-11 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                      <Phone className="w-4 h-4" aria-hidden="true" /> Call 911
                    </a>
                    <a
                      href={`tel:${consultation.pharmacyPhone.replace(/[^0-9]/g, '')}`}
                      className="min-h-11 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                      <Phone className="w-4 h-4" aria-hidden="true" /> Your pharmacy ({consultation.pharmacyPhone})
                    </a>
                    <a
                      href="tel:18002221222"
                      className="min-h-11 px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                      <HeartPulse className="w-4 h-4" aria-hidden="true" /> Poison Control (1-800-222-1222)
                    </a>
                    <button
                      type="button"
                      onClick={() => onOpenEmergencyModal(msg.triageData)}
                      className="min-h-11 px-4 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <MapPin className="w-4 h-4 text-teal-700" aria-hidden="true" />
                      More emergency numbers
                    </button>
                  </div>
                </div>
              )}

              {msg.sender === 'pharmacist' && (
                <p className="mb-1 px-1 text-sm font-bold text-emerald-800 dark:text-emerald-300">Written by your pharmacist (a person)</p>
              )}
              <div
                className={`p-4 rounded-2xl text-base leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-teal-700 text-white rounded-tr-none'
                    : msg.sender === 'pharmacist'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-slate-900 dark:text-slate-100 rounded-tl-none border border-emerald-300 dark:border-emerald-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-200 dark:border-slate-700'
                }`}
              >
                {msg.text ? (
                  msg.sender === 'user' ? (
                    <div className="whitespace-pre-line">{msg.text}</div>
                  ) : (
                    <AnswerText
                      text={msg.text}
                      isStreaming={streamingMsgId === msg.id}
                      // Never hide any part of an answer that came with a safety alert.
                      allowCollapse={!msg.isEmergencyAlert}
                    />
                  )
                ) : (
                  <div className="flex items-center gap-1.5 py-1 text-slate-600 dark:text-slate-300 text-sm">
                    <span className="w-2 h-2 bg-teal-600 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-teal-600 rounded-full animate-bounce [animation-delay:0.15s]" />
                    <span className="w-2 h-2 bg-teal-600 rounded-full animate-bounce [animation-delay:0.3s]" />
                    <span className="ml-1">Looking at your notes…</span>
                  </div>
                )}

                {/* Food pictograms mentioned in the answer */}
                {msg.sender === 'pharmacist_ai' &&
                  msg.text &&
                  (() => {
                    const pics = detectMedicationPictorials(msg.text);
                    if (pics.length === 0) return null;
                    return (
                      <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-wrap gap-2">
                        {pics.map((pType) => (
                          <PictorialWarningLabel
                            key={pType}
                            type={pType}
                            size="sm"
                            className="bg-white dark:bg-slate-900"
                          />
                        ))}
                      </div>
                    );
                  })()}
              </div>

              {msg.sender === 'pharmacist_ai' && msg.kind === 'answer' && msg.citations && msg.citations.length > 0 && (
                <SourceList citations={msg.citations} />
              )}

              <div className={`text-sm text-slate-500 mt-1 px-1 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                {msg.timestamp}
              </div>
            </div>

            {msg.sender === 'user' && (
              <div
                aria-hidden="true"
                className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0 text-sm font-bold mt-1"
              >
                You
              </div>
            )}
          </div>
        ))}

      </div>

      {/* Suggested questions, built from this patient's medicines */}
      <div className="shrink-0 p-2.5 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
        <span className="text-slate-600 dark:text-slate-300 text-sm font-medium shrink-0 flex items-center gap-1 pl-1">
          <Sparkles className="w-4 h-4 text-teal-700" aria-hidden="true" /> Try:
        </span>
        {quickPrompts.map((prompt) => (
          <button
            type="button"
            key={prompt}
            onClick={() => handleSendMessage(prompt)}
            disabled={isLoading}
            className="min-h-10 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm rounded-lg border border-slate-300 dark:border-slate-700 whitespace-nowrap transition-colors shrink-0 disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="shrink-0 p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Type your question"
          placeholder="Type your question here"
          className="flex-1 min-h-12 px-4 py-2.5 text-base bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder-slate-500"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          aria-label="Send question"
          className="min-h-12 min-w-12 px-4 bg-teal-700 hover:bg-teal-800 text-white rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center shrink-0"
        >
          <Send className="w-5 h-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
};

/**
 * An answer rendered as formatted text. Long finished answers are shortened to
 * the first few lines with "Show more"; answers are never shortened while they
 * stream in, and never when they carry a safety alert (`allowCollapse` false).
 */
const COLLAPSE_CHARS = 450;

const AnswerText: React.FC<{ text: string; isStreaming: boolean; allowCollapse: boolean }> = ({
  text,
  isStreaming,
  allowCollapse,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > COLLAPSE_CHARS;
  const collapsed = allowCollapse && isLong && !isStreaming && !expanded;

  return (
    <div>
      <div className={collapsed ? 'max-h-52 overflow-hidden relative' : ''}>
        <ChatMarkdown text={text} />
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 ml-1 bg-teal-500 rounded-sm animate-pulse align-middle" aria-hidden="true" />
        )}
        {collapsed && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-100 dark:from-slate-800 to-transparent"
          />
        )}
      </div>
      {allowCollapse && isLong && !isStreaming && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={!collapsed}
          className="mt-2 min-h-11 text-sm font-bold text-teal-800 dark:text-teal-300 underline underline-offset-2"
        >
          {collapsed ? 'Show more' : 'Show less'}
        </button>
      )}
    </div>
  );
};


/** Where an answer came from: the patient's own visit notes, or the FDA label (with a link). */
const SourceList: React.FC<{ citations: ChatCitation[] }> = ({ citations }) => (
  <details className="mt-2 px-1 text-sm text-slate-700 dark:text-slate-300">
    <summary className="cursor-pointer min-h-11 flex items-center gap-1.5 font-semibold text-teal-800 dark:text-teal-300">
      <FileText className="w-4 h-4" aria-hidden="true" /> Where this comes from ({citations.length})
    </summary>
    <ul className="space-y-2 mt-1">
      {citations.map((c) => (
        <li key={c.id} className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
          <p className="font-semibold text-slate-900 dark:text-slate-100">{c.label}</p>
          <p className="mt-0.5 italic">“{c.quote}”</p>
          {c.url && (
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline text-teal-800 dark:text-teal-300">
              Open the official label
            </a>
          )}
        </li>
      ))}
    </ul>
  </details>
);
