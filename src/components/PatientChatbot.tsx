import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, AlertTriangle, Phone, MapPin, RefreshCw, Sparkles, ShieldAlert, HeartPulse } from 'lucide-react';
import { ConsultationRecord, ChatMessage, EmergencyTriageResult } from '../types/pharmacy';
import { notificationService } from '../utils/audioNotification';
import { PictorialWarningLabel, detectMedicationPictorials } from './PictorialWarningLabel';

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
      text: `Hello ${consultation.patientName}! I am your clinical pharmacy assistant, directly grounded in Dr. Sarah Jenkins' consultation notes from ${consultation.consultationDate}.\n\nYou can ask me anything about how or when to take your pills, what foods to avoid, what to do if you miss a dose, or if you feel unwell. How can I assist you right now?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);

  const quickPrompts = [
    'Why do I take Atorvastatin at 8:00 PM?',
    'Can I drink coffee with my morning pills?',
    'What if I took a double dose by accident?',
    'Can I take ibuprofen or Advil with my meds?',
    'Why do I feel slightly dizzy when standing up?',
    'Can I have a glass of wine or grapefruit juice?',
    'What should I do if I miss my morning dose?',
  ];

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

    try {
      // 1. High-speed streaming SSE connection (starts streaming in ~250ms)
      const response = await fetch('/api/patient-chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          consultationData: consultation,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Streaming not available, falling back to instant JSON');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';

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
            } else if (payload.type === 'error') {
              throw new Error(payload.error || 'Server stream error');
            }
          } catch (parseErr) {
            // continue processing subsequent chunks
          }
        }
      }
    } catch (streamErr) {
      // Fast fallback to non-streaming endpoint
      try {
        const response = await fetch('/api/patient-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userText,
            consultationData: consultation,
          }),
        });

        const data = await response.json();
        if (data.success) {
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
                    text: 'I am temporarily having trouble reaching the clinical database. Please call our 24/7 Pharmacy line at 1-800-555-7427 or 911.',
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
                  text: 'Network connection issue. Please verify your connection or call the pharmacy desk directly.',
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
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[700px] overflow-hidden">
      {/* Chat Header */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src="/src/assets/images/avatar_pharmacist_lead_1793849084943.jpg"
              alt="Dr. Sarah Jenkins PharmD"
              className="w-11 h-11 rounded-full object-cover border-2 border-teal-500"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // Fallback if image path differs
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="w-3 h-3 bg-emerald-500 rounded-full border-2 border-white absolute bottom-0 right-0" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Dr. Sarah Jenkins, PharmD (AI Consultation Assistant)
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Grounded in your {consultation.consultationDate} prescription consultation
            </p>
          </div>
        </div>

        <button
          onClick={() => onOpenEmergencyModal()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-bold rounded-lg transition-colors border border-rose-200 dark:border-rose-800"
        >
          <ShieldAlert className="w-4 h-4 text-rose-600" />
          Urgent Help / Clinics
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${
              msg.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.sender === 'pharmacist_ai' && (
              <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-950 flex items-center justify-center text-teal-800 dark:text-teal-300 shrink-0 text-xs font-bold mt-1">
                Rx
              </div>
            )}

            <div className={`max-w-[85%] ${msg.sender === 'user' ? 'order-1' : 'order-2'}`}>
              <div
                className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-teal-700 text-white rounded-tr-none'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-200 dark:border-slate-700'
                }`}
              >
                {/* Formatted Text or Streaming Typing Dots */}
                {msg.text ? (
                  <div className="whitespace-pre-line">
                    {msg.text}
                    {streamingMsgId === msg.id && (
                      <span className="inline-block w-1.5 h-3.5 ml-1 bg-teal-500 rounded-sm animate-pulse align-middle" />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 py-1 text-slate-500 text-xs">
                    <span className="w-2 h-2 bg-teal-600 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-teal-600 rounded-full animate-bounce [animation-delay:0.15s]" />
                    <span className="w-2 h-2 bg-teal-600 rounded-full animate-bounce [animation-delay:0.3s]" />
                    <span className="ml-1 text-[11px] text-slate-500 font-medium">
                      Consulting Dr. Jenkins' clinical guidance...
                    </span>
                  </div>
                )}

                {/* Auxiliary Food Restriction Pictorial Stickers in AI Responses */}
                {msg.sender === 'pharmacist_ai' && msg.text && (
                  (() => {
                    const pics = detectMedicationPictorials(msg.text);
                    if (pics.length === 0) return null;
                    return (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-wrap gap-2">
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
                  })()
                )}

                {/* Emergency & Concerning Symptom Inline Triage Banner */}
                {msg.isEmergencyAlert && msg.triageData && (
                  <div className="mt-3.5 p-4 bg-rose-50 dark:bg-rose-950/80 border-2 border-rose-400 dark:border-rose-700 rounded-xl space-y-3 shadow-sm">
                    <div className="flex items-start gap-2.5 text-rose-900 dark:text-rose-100 font-bold text-xs leading-relaxed">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="block uppercase tracking-wider text-[11px] text-rose-700 dark:text-rose-400 font-extrabold mb-0.5">
                          Direct Clinical & Emergency Escalation
                        </span>
                        <span>{msg.triageData.patientInstruction}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1 border-t border-rose-200/80 dark:border-rose-800/80">
                      <a
                        href="tel:911"
                        className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" /> Call 911 Emergency
                      </a>
                      <a
                        href="tel:18005557427"
                        className="px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" /> Call 24/7 Pharmacy (1-800-555-7427)
                      </a>
                      <a
                        href="tel:18002221222"
                        className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                      >
                        <HeartPulse className="w-3.5 h-3.5" /> Poison Control (1-800-222-1222)
                      </a>
                      <button
                        onClick={() => onOpenEmergencyModal(msg.triageData)}
                        className="px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <MapPin className="w-3.5 h-3.5 text-teal-600" />
                        View Nearby Walk-In Urgent Care
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div
                className={`text-[10px] text-slate-400 mt-1 px-1 ${
                  msg.sender === 'user' ? 'text-right' : 'text-left'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>

            {msg.sender === 'user' && (
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0 text-xs font-bold mt-1">
                You
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Bar */}
      <div className="p-2.5 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto text-xs">
        <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1 pl-1">
          <Sparkles className="w-3 h-3 text-teal-600" /> Suggested:
        </span>
        {quickPrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(prompt)}
            disabled={isLoading}
            className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 whitespace-nowrap transition-colors shrink-0 disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about food, timing, missing a dose, or how you feel..."
          className="flex-1 px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
