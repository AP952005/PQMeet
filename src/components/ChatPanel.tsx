import { useState, useRef, useEffect } from 'react';
import { X, Send, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { ChatMessage } from '@/hooks/useWebRTC';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClose: () => void;
}

export default function ChatPanel({ messages, onSendMessage, onClose }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col h-full pb-20">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-display font-semibold text-card-foreground">In-call messages</span>
          <Lock className="w-3 h-3 text-meet-green" />
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm mt-8">
            <p className="mb-1">No messages yet</p>
            <p className="text-xs">Send a message to start chatting</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`${msg.isSelf ? 'text-right' : ''}`}>
            <div className={`flex items-baseline gap-2 mb-0.5 ${msg.isSelf ? 'justify-end' : ''}`}>
              <span className="text-xs font-medium text-card-foreground">
                {msg.isSelf ? 'You' : msg.from}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className={`inline-block px-3 py-1.5 rounded-xl text-sm max-w-[85%] break-words ${msg.isSelf
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-accent text-card-foreground rounded-bl-md'
              }`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0 bg-card">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 h-9 text-sm"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 shrink-0 hover:bg-primary/90 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
