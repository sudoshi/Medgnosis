"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  XMarkIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
  MinusIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";

import { MicrophonePermission } from "./MicrophonePermission";

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
  const [isSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setIsActive(true);
      // Add welcome message if no messages exist
      if (messages.length === 0) {
        setMessages([
          {
            role: "assistant",
            content: "How can I help?",
            timestamp: new Date(),
          },
        ]);
      }
    } else {
      setIsActive(false);
      setIsMinimized(false);
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

    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // TODO: Implement actual AI response logic
    const assistantMessage: Message = {
      role: "assistant",
      content:
        "I'm still being implemented, but I'll be able to help you soon!",
      timestamp: new Date(),
    };

    setTimeout(() => {
      setMessages((prev) => [...prev, assistantMessage]);
    }, 1000);
  };

  const handleVoiceEnable = useCallback(async () => {
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
  }, []);

  const handleVoiceDisable = useCallback(() => {
    setVoiceEnabled(false);
    localStorage.setItem("abbyVoiceEnabled", "false");
    setShowPermissionModal(false);
  }, []);

  const toggleVoice = () => {
    if (!voiceEnabled) {
      setShowPermissionModal(true);
    } else {
      handleVoiceDisable();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <MicrophonePermission
        isOpen={showPermissionModal}
        onAllow={handleVoiceEnable}
        onDeny={handleVoiceDisable}
      />
      <div
        className={`fixed right-4 bottom-4 z-50 flex flex-col rounded-lg bg-dark-primary border border-dark-border shadow-xl transition-all duration-300 ${
          isMinimized ? "h-14 w-14" : "h-[600px] w-[400px]"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dark-border p-4">
          <div className="flex items-center space-x-3">
            <div className="relative h-8 w-8 rounded-full overflow-hidden">
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
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
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
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-dark-border p-4">
              <form
                className="flex items-center space-x-2"
                onSubmit={handleSubmit}
              >
                <input
                  className="flex-1 rounded-lg bg-dark-secondary p-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  placeholder="Type your message..."
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <button
                  className={`rounded-full p-2 ${
                    voiceEnabled
                      ? isSpeaking
                        ? "bg-accent-error hover:bg-accent-error/80"
                        : "bg-accent-primary hover:bg-accent-primary/80"
                      : "bg-dark-secondary hover:bg-dark-secondary/80"
                  }`}
                  title={voiceEnabled ? "Disable voice" : "Enable voice"}
                  type="button"
                  onClick={toggleVoice}
                >
                  <MicrophoneIcon className="h-5 w-5" />
                </button>
                <button
                  className="rounded-full bg-dark-secondary p-2 hover:bg-dark-secondary/80"
                  type="button"
                >
                  <SpeakerWaveIcon className="h-5 w-5" />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </>
  );
}
