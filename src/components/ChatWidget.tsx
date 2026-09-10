import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, Send, X, Minimize2, User, Loader2 } from "lucide-react";
import { useAuth } from "./FirebaseProvider";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { ChatMessage, ChatSession } from "../types";

interface ChatWidgetProps {
  onOpenTicketForm?: () => void;
}

export function ChatWidget({ onOpenTicketForm }: ChatWidgetProps = {}) {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !isOpen) return;

    const q = query(
      collection(db, `chats/${user.uid}/messages`),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id } as ChatMessage)
      );
      setMessages(msgs);
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    });

    return unsubscribe;
  }, [user, isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !message.trim()) return;

    const text = message.trim();
    setMessage("");
    setLoading(true);

    try {
      const chatRef = doc(db, "chats", user.uid);
      
      // Ensure chat session exists
      await setDoc(chatRef, {
        userId: user.uid,
        userName: profile?.displayName || user.email || "Anonymous",
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await addDoc(collection(db, `chats/${user.uid}/messages`), {
        text,
        senderId: user.uid,
        senderRole: "user",
        createdAt: serverTimestamp(),
      });

      // Background notification to Telegram for real-time chat messages
      fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile?.displayName || user.displayName || "Customer (Live Chat)",
          accountNumber: profile?.accountNumber || "N/A",
          contact: profile?.phone || user.email || "Registered Client",
          category: "Live Chat Support Message",
          message: text,
        }),
      }).catch((err) => console.warn("Live chat telegram dispatch notice:", err));

    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${user.uid}/messages`);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[100]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="mb-3 w-[calc(100vw-2rem)] max-w-sm sm:w-96 h-[72vh] max-h-[480px] sm:h-[500px] bg-bg-base border border-primary/40 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-primary p-3.5 sm:p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <User size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Support Agent</h3>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[8px] font-bold text-white/80 uppercase">Online</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {onOpenTicketForm && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenTicketForm();
                    }}
                    className="text-[9px] font-mono font-bold bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded transition-colors uppercase cursor-pointer"
                    title="Open Detailed Support Ticket Form"
                  >
                    Ticket Form
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white/80 hover:text-white p-1 transition-colors"
                  aria-label="Close Chat"
                >
                  <Minimize2 size={18} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 scrollbar-thin scrollbar-thumb-primary/20"
            >
              <div className="text-center py-2 sm:py-4">
                <span className="text-[9px] font-black uppercase tracking-widest text-text-muted px-3 py-1 border border-border-subtle rounded-full">
                  Real-time Support
                </span>
              </div>

              {messages.length === 0 && (
                <div className="text-center py-8 sm:py-10 opacity-60">
                  <MessageSquare size={32} className="mx-auto mb-2 text-primary" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-dim">How can we assist you today?</p>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.senderRole === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] p-3 text-xs sm:text-[11px] leading-relaxed ${
                      msg.senderRole === "user"
                        ? "bg-primary text-white italic rounded-l-xl rounded-tr-xl font-medium shadow-md shadow-primary/20"
                        : "bg-white/5 border border-border-subtle text-white rounded-r-xl rounded-tl-xl"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t border-border-subtle bg-hot-black/50">
              <div className="relative flex items-center gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 bg-bg-base border border-border-subtle p-3 text-xs sm:text-[11px] text-white focus:outline-none focus:border-primary transition-all placeholder:text-text-muted italic"
                />
                <button
                  type="submit"
                  disabled={loading || !message.trim()}
                  className="w-10 h-10 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white flex items-center justify-center transition-all group shrink-0"
                  aria-label="Send message"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-2xl transition-all cursor-pointer ${
          isOpen ? "bg-hot-black border border-primary/50 text-primary" : "bg-primary text-white shadow-primary/30"
        }`}
        aria-label="Open support chat"
      >
        {isOpen ? <X size={20} /> : <MessageSquare size={20} />}
      </motion.button>
    </div>
  );
}
