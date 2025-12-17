
import React, { useState, useRef } from 'react';
import { Send, Loader2, Eraser, BrainCircuit } from 'lucide-react';

export const SolverWindow = () => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Determines the backend URL.
    // 1. Checks Vite environment variable (for production/web).
    // 2. Defaults to localhost:8888 for local development.
    const getApiUrl = () => {
        // @ts-ignore
        return import.meta.env.VITE_API_URL || 'http://localhost:8888';
    };

    const handleSolve = async () => {
        if (!input.trim()) return;
        
        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);

        try {
            const apiUrl = getApiUrl();
            
            // Send request to our custom backend
            const response = await fetch(`${apiUrl}/api/solve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt: userMsg }),
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            setMessages(prev => [...prev, { role: 'model', text: data.text || "Sorry, I couldn't generate a solution." }]);

        } catch (error: any) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'model', text: `Error: ${error.message || "Failed to connect to the Server."}\nMake sure the backend server is running.` }]);
        } finally {
            setLoading(false);
            setTimeout(() => {
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }, 100);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSolve();
        }
    };

    return (
        <div className="flex flex-col h-screen bg-white text-slate-800 font-sans">
            {/* Header */}
            <div className="bg-indigo-600 text-white p-4 shadow-md flex items-center gap-2 shrink-0">
                <BrainCircuit size={24} />
                <div>
                    <h1 className="font-bold text-lg">Math Solver</h1>
                    <p className="text-xs text-indigo-200">Teacher's Edition (Gemini Powered)</p>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50" ref={scrollRef}>
                {messages.length === 0 && (
                    <div className="text-center text-slate-400 mt-20">
                        <BrainCircuit size={48} className="mx-auto mb-4 opacity-50" />
                        <p>Enter a math problem to get a detailed solution.</p>
                        <p className="text-sm mt-2">Example: "Find the area of a triangle with sides 3, 4, 5."</p>
                    </div>
                )}
                
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-lg p-4 shadow-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                            {msg.text}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm flex items-center gap-2">
                            <Loader2 size={18} className="animate-spin text-indigo-600" />
                            <span className="text-sm text-slate-500">Thinking...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-slate-200 bg-white shrink-0">
                <div className="relative">
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your math problem here..."
                        className="w-full border border-slate-300 rounded-lg pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-24 shadow-sm"
                    />
                    <div className="absolute bottom-3 right-3 flex gap-2">
                        <button 
                            onClick={() => setMessages([])} 
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Clear History"
                        >
                            <Eraser size={20} />
                        </button>
                        <button 
                            onClick={handleSolve} 
                            disabled={loading || !input.trim()}
                            className="bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Solve"
                        >
                            {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                        </button>
                    </div>
                </div>
                <div className="text-xs text-center text-slate-400 mt-2">
                    Press Enter to solve. Shift+Enter for new line.
                </div>
            </div>
        </div>
    );
};
