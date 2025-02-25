"use client";

import {
  XMarkIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
  MinusIcon,
  PaperAirplaneIcon,
  StopIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";

import { ollamaService } from "@/services/OllamaService";
import { MicrophonePermission } from "./MicrophonePermission";
import { VoiceController } from "./VoiceController";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AbbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  setIsActive: (active: boolean) => void;
}

export function AbbyModal({ isOpen, onClose, setIsActive }: AbbyModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleMessage = async (content: string) => {
    if (!content.trim()) return;
    
    setIsProcessing(true);
    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      const stream = await ollamaService.chat(content);
      const reader = stream.getReader();
      let responseText = '';
      let partialResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        responseText += chunk;
        partialResponse += chunk;

        // Update UI with partial response every few characters
        if (partialResponse.length > 10) {
          const assistantMessage: Message = {
            role: 'assistant',
            content: responseText,
            timestamp: new Date(),
          };
          setMessages(prev => {
            // Replace the last message if it's from the assistant
            if (prev[prev.length - 1]?.role === 'assistant') {
              return [...prev.slice(0, -1), assistantMessage];
            }
            return [...prev, assistantMessage];
          });
          partialResponse = '';
        }
      }

      // Ensure the final message is complete
      const finalMessage: Message = {
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };
      setMessages(prev => {
        if (prev[prev.length - 1]?.role === 'assistant') {
          return [...prev.slice(0, -1), finalMessage];
        }
        return [...prev, finalMessage];
      });

      // Add response to Ollama conversation history
      ollamaService.addAssistantResponse(responseText);
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Cleanup effect
  useEffect(() => {
    return () => {
      ollamaService.clearHistory();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsActive(true);
      // Add welcome message if no messages exist
      if (messages.length === 0) {
        const welcomeMessage: Message = {
          role: 'assistant',
          content: 'How can I help?',
          timestamp: new Date(),
        };
        setMessages([welcomeMessage]);
        ollamaService.addAssistantResponse(welcomeMessage.content);
      }
    } else {
      setIsActive(false);
      setIsMinimized(false);
      // Clear conversation history when closing
      ollamaService.clearHistory();
    }
  }, [isOpen, messages.length, setIsActive]);

  useEffect(() => {
    // Check if voice features were previously enabled
    const savedVoicePreference = localStorage.getItem("abbyVoiceEnabled");

    if (savedVoicePreference === "true") {
      setVoiceEnabled(true);
    }
  }, []);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await handleMessage(input);
  };

  const handleVoiceEnable = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setVoiceEnabled(true);
      localStorage.setItem("abbyVoiceEnabled", "true");
      setShowPermissionModal(false);
    } catch (error) {
      console.error("Microphone permission denied:", error);
      setVoiceEnabled(false);
      localStorage.setItem("abbyVoiceEnabled", "false");
    }
  };

  const handleVoiceDisable = () => {
    setVoiceEnabled(false);
    localStorage.setItem("abbyVoiceEnabled", "false");
    setShowPermissionModal(false);
  };

  const toggleVoice = () => {
    if (!voiceEnabled) {
      setShowPermissionModal(true);
    } else {
      handleVoiceDisable();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      {showPermissionModal && (
        <MicrophonePermission
          isOpen={showPermissionModal}
          onAllow={handleVoiceEnable}
          onDeny={handleVoiceDisable}
        />
      )}
      {voiceEnabled && (
        <VoiceController
          enabled={voiceEnabled && isOpen && !isMinimized}
          onWakeWord={() => setIsMinimized(false)}
          onResponse={handleMessage}
          onListeningChange={setIsListening}
        />
      )}
      <div
        className={`fixed right-4 bottom-4 z-50 flex flex-col rounded-lg bg-dark-primary border border-dark-border shadow-xl transition-all duration-300 ${
          isMinimized ? "h-14 w-14" : "h-[600px] w-[400px]"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dark-border p-4">
          <div className="flex items-center space-x-3">
            <div className="relative h-8 w-8 rounded-full overflow-hidden">
              <div className={`absolute inset-0 z-10 rounded-full ${isListening ? 'animate-pulse ring-2 ring-accent-primary' : ''}`} />
              <Image
                fill
                alt="Abby AI Assistant"
                className="object-cover"
                src="/images/Abby-AI.png"
              />
            </div>
            {!isMinimized && (
              <div>
                <h3 className="font-medium">Abby</h3>
                <p className="text-xs text-dark-text-secondary">AI Assistant</p>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              className={`rounded p-1 hover:bg-dark-secondary ${voiceEnabled ? 'text-accent-primary' : ''}`}
              onClick={toggleVoice}
              title={voiceEnabled ? 'Disable voice control' : 'Enable voice control'}
            >
              <SpeakerWaveIcon className={`h-5 w-5 ${isListening ? 'animate-pulse' : ''}`} />
            </button>
            <button
              className="rounded p-1 hover:bg-dark-secondary"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              <MinusIcon className="h-5 w-5" />
            </button>
            <button
              className="rounded p-1 hover:bg-dark-secondary"
              onClick={onClose}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === "user"
                        ? "bg-accent-primary text-white"
                        : "bg-dark-secondary"
                    }`}
                  >
                    <p>{message.content}</p>
                    <p className="mt-1 text-xs opacity-70">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg p-3 bg-dark-secondary">
                    <div className="flex space-x-2">
                      <div className="h-2 w-2 rounded-full bg-accent-primary animate-bounce" />
                      <div className="h-2 w-2 rounded-full bg-accent-primary animate-bounce delay-100" />
                      <div className="h-2 w-2 rounded-full bg-accent-primary animate-bounce delay-200" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="border-t border-dark-border p-4">
              <div className="flex space-x-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  disabled={isProcessing}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={toggleVoice}
                  className={voiceEnabled ? "text-accent-primary" : ""}
                >
                  <MicrophoneIcon className={`h-5 w-5 ${isListening ? "animate-pulse" : ""}`} />
                </Button>
                <Button
                  type="submit"
                  disabled={!input.trim() || isProcessing}
                  className="bg-accent-primary hover:bg-accent-primary/80"
                >
                  {isProcessing ? (
                    <StopIcon className="h-5 w-5" />
                  ) : (
                    <PaperAirplaneIcon className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
