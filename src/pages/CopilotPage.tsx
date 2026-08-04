import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Send, Plus, Pin, MessageSquare, Trash2, Paperclip,
  FileText, Mail, Briefcase, Code, TrendingUp, Star,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { services } from '@/services';
import { uid, timeAgo } from '@/utils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ChatConversation, ChatMessage } from '@/types';

const CAPABILITIES = [
  { icon: FileText, label: 'Improve Resume' },
  { icon: Briefcase, label: 'Tailor Resume' },
  { icon: Code, label: 'Explain JD' },
  { icon: Mail, label: 'Cover Letter' },
  { icon: TrendingUp, label: 'Career Advice' },
  { icon: MessageSquare, label: 'Interview Prep' },
  { icon: Star, label: 'Salary Negotiation' },
  { icon: FileText, label: 'Application Review' },
];

export function CopilotPage() {
  const { data: conversations } = useQuery({ queryKey: ['conversations'], queryFn: () => services.chat.listConversations() });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinned, setPinned] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeId) {
      const conv = conversations?.find((c) => c.id === activeId);
      setMessages(conv?.messages || []);
    }
  }, [activeId, conversations]);

  useEffect(() => {
    if (!activeId && conversations?.length) setActiveId(conversations[0].id);
  }, [conversations, activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || streaming) return;
    const userMsg: ChatMessage = { id: uid('msg'), role: 'user', content: input, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setStreaming(true);

    const assistantMsg: ChatMessage = { id: uid('msg'), role: 'assistant', content: '', createdAt: new Date().toISOString() };
    setMessages((m) => [...m, assistantMsg]);

    await services.ai.stream('claude', [...messages, userMsg], (token) => {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: token };
        return copy;
      });
    });
    setStreaming(false);
  };

  const newChat = async () => {
    const conv = await services.chat.createConversation('New conversation');
    setActiveId(conv.id);
    setMessages([]);
    toast.success('New conversation started');
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <div className="flex w-64 shrink-0 flex-col border-r border-border bg-card/30">
        <div className="p-3">
          <Button onClick={newChat} className="w-full gap-2"><Plus className="h-4 w-4" /> New Chat</Button>
        </div>
        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1 pb-4">
            {conversations?.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  activeId === c.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{c.title}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-medium">AI Copilot</span>
            <Badge variant="secondary" className="text-[10px]">Claude 3.5 Sonnet</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPinned(!pinned)} className="gap-1.5">
            <Pin className={cn('h-3.5 w-3.5', pinned && 'fill-primary text-primary')} /> Pinned
          </Button>
        </div>

        <ScrollArea className="flex-1" ref={scrollRef as never}>
          <div className="mx-auto max-w-3xl space-y-6 p-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-4 pt-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-chart-4 shadow-xl shadow-primary/20">
                  <Sparkles className="h-8 w-8 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">How can I help your job search?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Ask me to tailor resumes, explain JDs, prep interviews, and more.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CAPABILITIES.map((c) => (
                    <button key={c.label} onClick={() => setInput(`Help me with ${c.label}`)} className="glass-card flex flex-col items-center gap-2 p-3 text-center transition-colors hover:bg-accent/30">
                      <c.icon className="h-5 w-5 text-primary" />
                      <span className="text-xs">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}
              >
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-gradient-to-br from-primary to-chart-4 text-primary-foreground')}>
                  {msg.role === 'user' ? 'A' : <Sparkles className="h-4 w-4" />}
                </div>
                <div className={cn('max-w-[80%] rounded-2xl p-4', msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'glass-card')}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content || '...'}</p>
                  {msg.artifact && (
                    <div className="mt-3 rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-primary">
                        <FileText className="h-3.5 w-3.5" /> {msg.artifact.title}
                      </div>
                      <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{msg.artifact.content}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-border p-4">
          <div className="mx-auto max-w-3xl">
            <div className="glass-card flex items-end gap-2 p-2">
              <Button variant="ghost" size="icon" className="shrink-0"><Paperclip className="h-4 w-4" /></Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask anything about your job search..."
                rows={1}
                className="border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button onClick={send} disabled={streaming} size="icon" className="shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">Press Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </div>
  );
}
