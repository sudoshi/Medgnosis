"use client";

import { useState, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function OllamaTestPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    const userMessage = { role: "user", content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Add empty assistant message
      setMessages(prev => [...prev, { role: "assistant", content: "", timestamp: new Date() }]);

      // Get response from Ollama
      console.log("Getting response from Ollama...");
      
      // Make a direct fetch request to Ollama API
      const res = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gemma:latest',
          prompt: input,
          stream: true,
        }),
      });
      
      console.log("Got response from Ollama:", res);
      
      if (!res.ok) {
        throw new Error(`Ollama API error: ${res.status}`);
      }
      
      if (!res.body) {
        throw new Error('No response body from Ollama API');
      }
      
      const reader = res.body.getReader();
      console.log("Created reader:", reader);
      
      const decoder = new TextDecoder();
      let fullResponse = "";

      // Process the response chunks
      console.log("Starting to read chunks...");
      while (true) {
        console.log("Reading chunk...");
        const { done, value } = await reader.read();
        console.log("Read chunk:", { done, valueExists: !!value, valueLength: value ? value.length : 0 });
        
        if (done) {
          console.log("Done reading chunks");
          break;
        }

        // Decode and accumulate the response
        const chunkText = decoder.decode(value, { stream: true });
        console.log("Decoded text:", chunkText);
        
        // Parse JSON from the chunk
        const lines = chunkText.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            console.log("Parsing JSON:", line);
            const parsed = JSON.parse(line);
            console.log("Parsed JSON:", parsed);
            
            if (parsed.response) {
              fullResponse += parsed.response;
              console.log("Updated full response:", fullResponse);
              
              // Update the assistant message with the accumulated response
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                
                if (lastMessage && lastMessage.role === "assistant") {
                  newMessages[newMessages.length - 1] = {
                    ...lastMessage,
                    content: fullResponse,
                    timestamp: new Date(),
                  };
                }
                
                return newMessages;
              });
            }
          } catch (error) {
            console.error("Error parsing JSON:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Error: Could not get response", timestamp: new Date() },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 p-4 text-white">
      <h1 className="text-2xl font-bold mb-4 text-white">Ollama Test Page</h1>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-800 rounded-lg p-4 mb-4 shadow">
        {messages.map((message, index) => (
          <div 
            key={index}
            className={`mb-4 p-3 rounded-lg ${
              message.role === "user" 
                ? "bg-blue-900 ml-auto max-w-[80%]" 
                : "bg-gray-700 mr-auto max-w-[80%]"
            }`}
          >
            <div className="font-bold mb-1 text-white">
              {message.role === "user" ? "You" : "Assistant"}:
            </div>
            <div className="whitespace-pre-wrap text-gray-200">{message.content}</div>
            <div className="text-gray-400 text-xs">{message.timestamp.toLocaleTimeString()}</div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-center">
            <div className="animate-pulse text-blue-400">Loading...</div>
          </div>
        )}
      </div>
      
      {/* Input */}
      <form onSubmit={handleSubmit} className="flex">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 p-2 bg-gray-700 border border-gray-600 text-white rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Type a message..."
        />
        <button
          type="submit"
          disabled={isLoading}
          className="bg-blue-600 text-white p-2 rounded-r-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
}
