/**
 * AI Chat Component
 * Simple, effective chat interface for warehouse search and listing
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Loader2, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';

import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actionType?: string;
  data?: any;
}

interface AIChatProps {
  className?: string;
  initialMessage?: string;
  onWarehouseSelect?: (warehouseId: string) => void;
  embedded?: boolean;
}

export function AIChat({ 
  className, 
  initialMessage,
  onWarehouseSelect,
  embedded = false
}: AIChatProps) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `👋 Hi! I'm your warehouse assistant. I can help you:\n\n• Find warehouse space anywhere\n• Calculate pricing instantly\n• List your warehouse\n• Answer any questions\n\nWhat can I help you with today?`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(embedded || false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Quick action buttons
  const quickActions = [
    { label: "Find 5,000 sqft", value: "I need 5,000 sqft warehouse space" },
    { label: "Pricing info", value: "What's the average price per sqft?" },
    { label: "List warehouse", value: "I want to list my warehouse" },
    { label: "How it works", value: "How does this work?" }
  ];

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle initial message
  useEffect(() => {
    if (initialMessage && messages.length === 1) {
      handleSend(initialMessage);
    }
  }, [initialMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) {return;}

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Call AI API
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: getContext()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      // Add AI response
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        actionType: data.actionType,
        data: data.data
      };

      setMessages(prev => [...prev, aiMessage]);

      // Handle special actions
      if (data.actionType === 'search_results' && data.data?.warehouses) {
        // Could trigger additional UI updates here
      }

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const getContext = () => {
    // Get conversation context for listing flow, etc.
    const lastAssistantMessage = messages
      .filter(m => m.role === 'assistant')
      .pop();
    
    return lastAssistantMessage?.data;
  };

  const handleQuickAction = (value: string) => {
    setInput(value);
    handleSend(value);
  };

  // Floating chat widget
  if (!embedded && !isOpen) {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="fixed bottom-4 right-4 z-50"
      >
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 transition-colors"
        >
          <Bot className="w-6 h-6" />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={!embedded ? { y: 100, opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className={cn(
        embedded ? 'h-full flex flex-col' : 'fixed bottom-4 right-4 z-50 w-96 h-[600px] bg-white rounded-lg shadow-2xl flex flex-col',
        className
      )}
    >
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 rounded-t-lg flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          <span className="font-medium">Warehouse Assistant</span>
          <span className="w-2 h-2 bg-green-400 rounded-full" />
        </div>
        {!embedded && (
          <button
            onClick={() => setIsOpen(false)}
            className="text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div className="p-3 border-b flex gap-2 flex-wrap">
        {quickActions.map((action, i) => (
          <button
            key={i}
            onClick={() => handleQuickAction(action.value)}
            className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'flex gap-2',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
              )}
              
              <div
                className={cn(
                  'max-w-[80%] p-3 rounded-lg',
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                )}
              >
                <div className="whitespace-pre-wrap text-sm">
                  {formatMessage(message.content)}
                </div>
                {message.data?.warehouses && (
                  <div className="mt-2 space-y-2">
                    {message.data.warehouses.map((warehouse: any) => (
                      <button
                        key={warehouse.id}
                        onClick={() => onWarehouseSelect?.(warehouse.id)}
                        className="block w-full text-left p-2 bg-white/10 rounded hover:bg-white/20 transition-colors"
                      >
                        <div className="font-medium">{warehouse.name}</div>
                        <div className="text-xs opacity-80">
                          {warehouse.city} • ${warehouse.pricePerSqft}/sqft
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {message.role === 'user' && (
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-gray-600" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2"
          >
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-600" />
            </div>
            <div className="bg-gray-100 rounded-lg p-3">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            </div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </motion.div>
  );
}

// Format message content with markdown-like syntax
function formatMessage(content: string): React.ReactNode {
  // Simple formatting - expand as needed
  const lines = content.split('\n');
  
  return lines.map((line, i) => {
    // Bold text
    if (line.includes('**')) {
      const parts = line.split('**');
      return (
        <div key={i}>
          {parts.map((part, j) => 
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
          )}
        </div>
      );
    }
    
    // Bullet points
    if (line.startsWith('•') || line.startsWith('-')) {
      return (
        <div key={i} className="ml-2">
          {line}
        </div>
      );
    }
    
    // Links
    if (line.includes('[') && line.includes('](')) {
      const match = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        const [full, text, href] = match;
        return (
          <div key={i}>
            {line.substring(0, line.indexOf(full))}
            <a href={href} className="underline hover:opacity-80">
              {text}
            </a>
            {line.substring(line.indexOf(full) + full.length)}
          </div>
        );
      }
    }
    
    return <div key={i}>{line || '\u00A0'}</div>;
  });
}