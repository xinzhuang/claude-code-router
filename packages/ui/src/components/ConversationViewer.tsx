import { ConversationMessage, type Message } from './ConversationMessage';
import { Brain, Clock, Hash, Route } from 'lucide-react';

interface ConversationViewerProps {
  messages: Message[];
  model?: string;
  metadata?: {
    url?: string;
    method?: string;
    timestamp?: string;
    reqId?: string;
    [key: string]: unknown;
  };
}

export function ConversationViewer({ messages, model, metadata }: ConversationViewerProps) {
  // Count message types
  const userCount = messages.filter(m => m.role === 'user').length;
  const assistantCount = messages.filter(m => m.role === 'assistant').length;
  const systemCount = messages.filter(m => m.role === 'system').length;

  // Count tool calls
  const toolCallCount = messages.reduce((acc, m) => {
    if (Array.isArray(m.content)) {
      return acc + m.content.filter(c => c.type === 'tool_use').length;
    }
    return acc;
  }, 0);

  return (
    <div className="flex h-full flex-col bg-[#0d0f14]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/[0.06] bg-[#111318] px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-white/[0.06]">
            <Brain className="h-4 w-4 text-violet-400/80" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-white/90">Conversation</h2>
            {model && (
              <p className="text-[12px] text-white/40 font-mono mt-0.5">{model}</p>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          {systemCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/[0.08] border border-amber-500/20 px-2.5 py-1 text-amber-300/70">
              <span className="font-medium">{systemCount}</span> system
            </span>
          )}
          <span className="flex items-center gap-1.5 rounded-full bg-blue-500/[0.08] border border-blue-500/20 px-2.5 py-1 text-blue-300/70">
            <span className="font-medium">{userCount}</span> user
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-violet-500/[0.08] border border-violet-500/20 px-2.5 py-1 text-violet-300/70">
            <span className="font-medium">{assistantCount}</span> assistant
          </span>
          {toolCallCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20 px-2.5 py-1 text-cyan-300/70">
              <span className="font-medium">{toolCallCount}</span> tool calls
            </span>
          )}

          {metadata?.timestamp && (
            <span className="ml-auto flex items-center gap-1 text-white/25">
              <Clock className="h-3 w-3" />
              {new Date(metadata.timestamp).toLocaleString()}
            </span>
          )}
        </div>

        {/* Request Metadata */}
        {(metadata?.url || metadata?.reqId) && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-white/30">
            {metadata.url && (
              <span className="flex items-center gap-1.5">
                <Route className="h-3 w-3" />
                <span className="font-mono">{metadata.method || 'POST'} {metadata.url}</span>
              </span>
            )}
            {metadata.reqId && (
              <span className="flex items-center gap-1.5">
                <Hash className="h-3 w-3" />
                <span className="font-mono">{metadata.reqId}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin">
        {messages.map((message, index) => (
          <ConversationMessage
            key={index}
            message={message}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}
