import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, Send, X, Minimize2, User, Loader2, LogIn, CheckCircle2, ShieldCheck } from "lucide-react";
import { useAuth } from "./FirebaseProvider";
import { db, handleFirestoreError, OperationType, loginWithGoogle } from "../lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
} from "firebase/firestore";
import { ChatMessage } from "../types";

interface ChatWidgetProps {
  onOpenTicketForm?: () => void;
}

export function ChatWidget({ onOpenTicketForm }: ChatWidgetProps = {}) {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [telegramNotifiedNotice, setTelegramNotifiedNotice] = useState(false);

  // Guest chatter fields for unauthenticated visitors
  const [guestName, setGuestName] = useState(() => {
    return typeof window !== "undefined" ? localStorage.getItem("hf_guest_name") || "" : "";
  });
  const [guestContact, setGuestContact] = useState(() => {
    return typeof window !== "undefined" ? localStorage.getItem("hf_guest_contact") || "" : "";
  });
  const [guestMessages, setGuestMessages] = useState<Array<{ id: string; text: string; senderRole: "user" | "admin"; createdAt?: any }>>([
    {
      id: "welcome-1",
      text: "👋 Mabuhay! Welcome to HotFast.online Live Support. How may we assist your internet connection or billing today?",
      senderRole: "admin",
    },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen for real-time Firebase messages when user is authenticated
  useEffect(() => {
    if (!user || !isOpen) return;

    const q = query(
      collection(db, `chats/${user.uid}/messages`),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map(
          (d) => ({ ...d.data(), id: d.id } as ChatMessage)
        );
        setMessages(msgs);
        setTimeout(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      },
      (err) => {
        console.warn("Firestore chat listener notice:", err);
      }
    );

    return unsubscribe;
  }, [user, isOpen]);

  // Auto-scroll when guest messages change
  useEffect(() => {
    if (!user && isOpen) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    }
  }, [guestMessages, user, isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;

    setMessage("");
    setLoading(true);

    try {
      if (user) {
        // 1. Authenticated User flow: write to Firestore
        const chatRef = doc(db, "chats", user.uid);
        const displayName = profile?.displayName || user.displayName || user.email?.split("@")[0] || "Client";
        
        await setDoc(
          chatRef,
          {
            userId: user.uid,
            userName: displayName,
            lastMessage: text,
            lastMessageAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        await addDoc(collection(db, `chats/${user.uid}/messages`), {
          text,
          senderId: user.uid,
          senderRole: "user",
          createdAt: serverTimestamp(),
        });

        // 2. Dispatch automated instant alert directly to Admin's Telegram Bot
        fetch("/api/telegram/live-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: displayName,
            accountNumber: profile?.accountNumber || "N/A",
            email: user.email || profile?.email || "",
            phone: profile?.phone || "",
            plan: profile?.currentPlanId || "",
            userId: user.uid,
            message: text,
            isGuest: false,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.telegramNotified) {
              setTelegramNotifiedNotice(true);
              setTimeout(() => setTelegramNotifiedNotice(false), 4000);
            }
          })
          .catch((err) => console.warn("Live chat telegram dispatch notice:", err));
      } else {
        // Unauthenticated Guest flow
        const cleanName = guestName.trim() || "Website Visitor";
        const cleanContact = guestContact.trim();
        if (typeof window !== "undefined") {
          localStorage.setItem("hf_guest_name", cleanName);
          localStorage.setItem("hf_guest_contact", cleanContact);
        }

        // Add user message locally
        const userMsg = {
          id: `guest-${Date.now()}`,
          text,
          senderRole: "user" as const,
          createdAt: new Date(),
        };
        setGuestMessages((prev) => [...prev, userMsg]);

        // Dispatch instant alert to Telegram Bot
        const isEmail = cleanContact.includes("@");
        fetch("/api/telegram/live-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: cleanName,
            accountNumber: cleanContact && !isEmail ? cleanContact : "Visitor",
            email: isEmail ? cleanContact : "",
            phone: !isEmail ? cleanContact : "",
            message: text,
            isGuest: true,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.telegramNotified) {
              setTelegramNotifiedNotice(true);
              setTimeout(() => setTelegramNotifiedNotice(false), 4000);
            }
            // Auto reply acknowledging Telegram dispatch
            setTimeout(() => {
              setGuestMessages((prev) => [
                ...prev,
                {
                  id: `reply-${Date.now()}`,
                  text: `⚡ Your message was directly notified to our Support Agent via Telegram! An on-duty engineer will respond shortly.${
                    !cleanContact ? " Tip: Add your contact number above so we can reach you if you navigate away." : ""
                  }`,
                  senderRole: "admin",
                  createdAt: new Date(),
                },
              ]);
            }, 600);
          })
          .catch((err) => {
            console.warn("Guest telegram dispatch notice:", err);
            setTimeout(() => {
              setGuestMessages((prev) => [
                ...prev,
                {
                  id: `reply-${Date.now()}`,
                  text: "Your message has been sent to our on-duty support team. For immediate account assistance, you can also sign in or open a support ticket.",
                  senderRole: "admin",
                  createdAt: new Date(),
                },
              ]);
            }, 500);
          });
      }
    } catch (error) {
      if (user) {
        handleFirestoreError(error, OperationType.WRITE, `chats/${user.uid}/messages`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[100]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="mb-3 w-[calc(100vw-2rem)] max-w-sm sm:w-96 h-[74vh] max-h-[520px] sm:h-[520px] bg-bg-base border border-primary/40 shadow-2xl flex flex-col overflow-hidden rounded-xl"
          >
            {/* Header */}
            <div className="bg-primary p-3.5 sm:p-4 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <User size={16} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Live Support Agent</h3>
                    <span className="text-[8px] bg-white/25 text-white font-mono font-bold px-1.5 py-0.2 rounded uppercase">
                      Telegram Linked
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[8px] font-bold text-white/90 uppercase">Online & Ready</span>
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
                    Ticket
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white/80 hover:text-white p-1 transition-colors cursor-pointer"
                  aria-label="Close Chat"
                >
                  <Minimize2 size={18} />
                </button>
              </div>
            </div>

            {/* Telegram Notification Banner Notification */}
            <AnimatePresence>
              {telegramNotifiedNotice && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-emerald-950/90 border-b border-emerald-500/30 px-3 py-1.5 flex items-center gap-2 text-[9px] font-mono text-emerald-300"
                >
                  <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                  <span>Agent notified on Telegram in real time!</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Guest Banner if not signed in */}
            {!user && (
              <div className="bg-hot-black/60 border-b border-border-subtle p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-text-muted flex items-center gap-1">
                    <ShieldCheck size={11} className="text-primary" />
                    Guest Mode • Auto Telegram Alert
                  </span>
                  <button
                    type="button"
                    onClick={() => loginWithGoogle()}
                    className="text-primary hover:text-primary-light font-bold flex items-center gap-1 uppercase cursor-pointer text-[8px]"
                  >
                    <LogIn size={10} />
                    Sign In
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Your Name (Optional)"
                    className="bg-bg-surface border border-border-subtle px-2 py-1 text-[10px] text-white focus:outline-none focus:border-primary placeholder:text-text-muted rounded"
                  />
                  <input
                    type="text"
                    value={guestContact}
                    onChange={(e) => setGuestContact(e.target.value)}
                    placeholder="Phone or Acct #"
                    className="bg-bg-surface border border-border-subtle px-2 py-1 text-[10px] text-white focus:outline-none focus:border-primary placeholder:text-text-muted rounded"
                  />
                </div>
              </div>
            )}

            {/* Messages Container */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 scrollbar-thin scrollbar-thumb-primary/20 bg-bg-base/50"
            >
              <div className="text-center py-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-text-muted px-2.5 py-0.5 border border-border-subtle rounded-full bg-bg-surface/50">
                  {user ? "Subscriber Chat • Telegram Synced" : "Live Chat • Telegram Dispatched"}
                </span>
              </div>

              {/* Authenticated Mode Messages */}
              {user && messages.length === 0 && (
                <div className="text-center py-6 opacity-60">
                  <MessageSquare size={28} className="mx-auto mb-2 text-primary" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-dim">
                    How can we assist you today?
                  </p>
                  <p className="text-[8px] text-text-muted mt-1">
                    Your message will immediately alert the support team on Telegram.
                  </p>
                </div>
              )}

              {user &&
                messages.map((msg) => (
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

              {/* Guest Mode Messages */}
              {!user &&
                guestMessages.map((msg) => (
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

            {/* Input Form */}
            <form onSubmit={handleSendMessage} className="p-3 sm:p-3.5 border-t border-border-subtle bg-hot-black/70">
              <div className="relative flex items-center gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={user ? "Type your message to support..." : "Type message (notifies Telegram)..."}
                  className="flex-1 bg-bg-base border border-border-subtle p-2.5 sm:p-3 text-xs sm:text-[11px] text-white focus:outline-none focus:border-primary transition-all placeholder:text-text-muted italic rounded"
                />
                <button
                  type="submit"
                  disabled={loading || !message.trim()}
                  className="w-10 h-10 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white flex items-center justify-center transition-all group shrink-0 rounded cursor-pointer"
                  aria-label="Send message"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send
                      size={15}
                      className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                    />
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
        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-2xl transition-all cursor-pointer relative ${
          isOpen ? "bg-hot-black border border-primary/50 text-primary" : "bg-primary text-white shadow-primary/30"
        }`}
        aria-label="Open support chat"
      >
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-bg-base rounded-full animate-pulse" />
        {isOpen ? <X size={20} /> : <MessageSquare size={20} />}
      </motion.button>
    </div>
  );
}
