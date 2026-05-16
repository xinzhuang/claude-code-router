import { useState, Fragment } from 'react';
import { ChevronDown, ChevronRight, User, Bot, Wrench, Terminal, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TextBlock {
  type: 'text';
  text: string;
}

interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: 'text'; text: string }>;
  is_error?: boolean;
}

type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

interface ConversationMessageProps {
  message: Message;
  index: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isContentBlockArray(content: string | ContentBlock[]): content is ContentBlock[] {
  return Array.isArray(content);
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}

function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result';
}

function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}

function isImageBlock(block: ContentBlock): block is ImageBlock {
  return block.type === 'image';
}

// ─── Code Block Renderer ─────────────────────────────────────────────────────

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group/code relative my-2 rounded-lg overflow-hidden border border-white/[0.06]">
      <div className="flex items-center justify-between bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/40">
        <span className="font-mono uppercase tracking-wider">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto bg-black/30 p-3 text-[13px] leading-relaxed">
        <code className="text-white/80 font-mono">{code}</code>
      </pre>
    </div>
  );
}

// ─── Markdown-like text renderer (simplified) ────────────────────────────────

function RichText({ text }: { text: string }) {
  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-0">
      {parts.map((part, i) => {
        const codeMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
        if (codeMatch) {
          return <CodeBlock key={i} language={codeMatch[1] || undefined} code={codeMatch[2].trimEnd()} />;
        }
        // Regular text — preserve line breaks, render inline code
        if (!part) return null;
        return (
          <span key={i}>
            {part.split(/(`[^`]+`)/g).map((segment, j) => {
              if (segment.startsWith('`') && segment.endsWith('`')) {
                return (
                  <code key={j} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] font-mono text-amber-300/90">
                    {segment.slice(1, -1)}
                  </code>
                );
              }
              // Preserve line breaks
              return segment.split('\n').map((line, k) => (
                <Fragment key={`${j}-${k}`}>
                  {k > 0 && <br />}
                  {line}
                </Fragment>
              ));
            })}
          </span>
        );
      })}
    </div>
  );
}

// ─── Tool Call Component ─────────────────────────────────────────────────────

function ToolCallBlock({ block }: { block: ToolUseBlock }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-cyan-500/[0.06]"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-cyan-400/70" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-cyan-400/70" />
        )}
        <Wrench className="h-3.5 w-3.5 text-cyan-400/70" />
        <span className="text-[13px] font-medium text-cyan-300/90">{block.name}</span>
        <span className="ml-auto font-mono text-[11px] text-white/30">{block.id}</span>
      </button>
      {expanded && (
        <div className="border-t border-cyan-500/10 bg-black/20 p-3">
          <pre className="overflow-x-auto text-[12px] font-mono text-white/60">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Tool Result Component ───────────────────────────────────────────────────

function ToolResultBlock({ block }: { block: ToolResultBlock }) {
  const [expanded, setExpanded] = useState(false);

  const contentText = typeof block.content === 'string'
    ? block.content
    : block.content.map(c => c.text).join('\n');

  const lineCount = contentText.split('\n').length;

  return (
    <div className={cn(
      "my-2 rounded-lg border overflow-hidden",
      block.is_error
        ? "border-red-500/20 bg-red-500/[0.04]"
        : "border-emerald-500/20 bg-emerald-500/[0.04]"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
          block.is_error ? "hover:bg-red-500/[0.06]" : "hover:bg-emerald-500/[0.06]"
        )}
      >
        {expanded ? (
          <ChevronDown className={cn("h-3.5 w-3.5", block.is_error ? "text-red-400/70" : "text-emerald-400/70")} />
        ) : (
          <ChevronRight className={cn("h-3.5 w-3.5", block.is_error ? "text-red-400/70" : "text-emerald-400/70")} />
        )}
        <Terminal className={cn("h-3.5 w-3.5", block.is_error ? "text-red-400/70" : "text-emerald-400/70")} />
        <span className={cn("text-[13px] font-medium", block.is_error ? "text-red-300/90" : "text-emerald-300/90")}>
          {block.is_error ? 'Tool Error' : 'Tool Result'}
        </span>
        <span className="ml-auto font-mono text-[11px] text-white/30">
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </span>
      </button>
      {expanded && (
        <div className={cn("border-t bg-black/20 p-3", block.is_error ? "border-red-500/10" : "border-emerald-500/10")}>
          <pre className="overflow-x-auto text-[12px] font-mono text-white/60 whitespace-pre-wrap">
            {contentText}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Role Configuration ──────────────────────────────────────────────────────

const roleConfig = {
  system: {
    label: 'System',
    icon: Terminal,
    containerClass: 'border-amber-500/20 bg-amber-500/[0.03]',
    headerClass: 'text-amber-300/80',
    iconClass: 'text-amber-400/60',
  },
  user: {
    label: 'User',
    icon: User,
    containerClass: 'border-blue-500/20 bg-blue-500/[0.03]',
    headerClass: 'text-blue-300/80',
    iconClass: 'text-blue-400/60',
  },
  assistant: {
    label: 'Assistant',
    icon: Bot,
    containerClass: 'border-violet-500/20 bg-violet-500/[0.03]',
    headerClass: 'text-violet-300/80',
    iconClass: 'text-violet-400/60',
  },
} as const;

// ─── Main Component ──────────────────────────────────────────────────────────

export function ConversationMessage({ message, index }: ConversationMessageProps) {
  const config = roleConfig[message.role];
  const Icon = config.icon;

  const renderContent = () => {
    if (isContentBlockArray(message.content)) {
      return message.content.map((block, blockIndex) => {
        if (isToolUseBlock(block)) {
          return <ToolCallBlock key={blockIndex} block={block} />;
        }
        if (isToolResultBlock(block)) {
          return <ToolResultBlock key={blockIndex} block={block} />;
        }
        if (isImageBlock(block)) {
          return (
            <div key={blockIndex} className="my-2">
              <img
                src={`data:${block.source.media_type};base64,${block.source.data}`}
                alt="Uploaded content"
                className="max-w-full rounded-lg border border-white/[0.06]"
              />
            </div>
          );
        }
        if (isTextBlock(block)) {
          return <RichText key={blockIndex} text={block.text} />;
        }
        return null;
      });
    }

    // Plain string content
    return <RichText text={message.content} />;
  };

  return (
    <div
      className={cn("rounded-xl border transition-all", config.containerClass)}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Message Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-4 py-2.5">
        <Icon className={cn("h-4 w-4", config.iconClass)} />
        <span className={cn("text-[13px] font-semibold tracking-wide uppercase", config.headerClass)}>
          {config.label}
        </span>
        {message.role === 'system' && (
          <span className="ml-auto text-[11px] text-white/25 font-mono">prompt</span>
        )}
      </div>

      {/* Message Content */}
      <div className="px-4 py-3 text-[14px] leading-relaxed text-white/75">
        {renderContent()}
      </div>
    </div>
  );
}

export type { Message, ContentBlock };
