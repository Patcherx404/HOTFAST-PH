import React, { useState } from "react";
import {
  LifeBuoy,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Trash2,
  User,
  Phone,
  Hash,
  Calendar,
  MessageSquare,
  ExternalLink,
  ChevronDown,
  Filter,
  Check,
  RefreshCw,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SupportTicket } from "../types";
import { ASIA_TIMEZONE } from "../lib/dateUtils";
import { doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { toast } from "sonner";

interface AdminTicketsTabProps {
  tickets: SupportTicket[];
  loading?: boolean;
}

export function AdminTicketsTab({ tickets, loading = false }: AdminTicketsTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "in_progress" | "resolved" | "closed">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<SupportTicket | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter tickets
  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      t.ticketId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.accountNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.message?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const uniqueCategories = Array.from(
    new Set(tickets.map((t) => t.category).filter(Boolean))
  );

  const handleUpdateStatus = async (ticket: SupportTicket, newStatus: SupportTicket["status"]) => {
    if (!ticket.id) return;
    setUpdatingId(ticket.id);
    try {
      const ticketRef = doc(db, "support_tickets", ticket.id);
      await updateDoc(ticketRef, {
        status: newStatus,
        resolvedAt: newStatus === "resolved" ? serverTimestamp() : null,
      });
      toast.success(`Ticket ${ticket.ticketId} marked as ${newStatus.toUpperCase()}`);
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket({ ...selectedTicket, status: newStatus });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `support_tickets/${ticket.id}`);
      toast.error("Failed to update ticket status");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveNote = async (ticket: SupportTicket) => {
    if (!ticket.id) return;
    setUpdatingId(ticket.id);
    try {
      const ticketRef = doc(db, "support_tickets", ticket.id);
      await updateDoc(ticketRef, {
        adminNotes: adminNote,
      });
      toast.success("Admin note saved!");
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket({ ...selectedTicket, adminNotes: adminNote });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `support_tickets/${ticket.id}`);
      toast.error("Failed to save note");
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmTicketDeletion = async () => {
    if (!ticketToDelete?.id) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "support_tickets", ticketToDelete.id));
      toast.success(`Ticket ${ticketToDelete.ticketId} deleted`);
      if (selectedTicket?.id === ticketToDelete.id) {
        setSelectedTicket(null);
      }
      setTicketToDelete(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `support_tickets/${ticketToDelete.id}`);
      toast.error("Failed to delete ticket");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteTicket = (ticket: SupportTicket) => {
    setTicketToDelete(ticket);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertCircle size={10} /> Open
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <Clock size={10} /> In Progress
          </span>
        );
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 size={10} /> Resolved
          </span>
        );
      case "closed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-slate-500/10 text-slate-400 border border-slate-500/30">
            <XCircle size={10} /> Closed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-white/5 text-text-muted border border-border-subtle">
            {status}
          </span>
        );
    }
  };

  const counts = {
    all: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    resolved: tickets.filter((t) => t.status === "resolved").length,
    closed: tickets.filter((t) => t.status === "closed").length,
  };

  return (
    <div className="space-y-6">
      {/* Top metrics bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Tickets", count: counts.all, color: "text-white" },
          { label: "Open / Pending", count: counts.open, color: "text-amber-400" },
          { label: "In Progress", count: counts.in_progress, color: "text-blue-400" },
          { label: "Resolved", count: counts.resolved, color: "text-emerald-400" },
        ].map((stat, idx) => (
          <div
            key={idx}
            className="p-4 bg-bg-surface border border-border-subtle flex flex-col justify-between"
          >
            <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
              {stat.label}
            </span>
            <span className={`text-2xl font-black italic tracking-tight mt-1 ${stat.color}`}>
              {stat.count}
            </span>
          </div>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between bg-bg-surface p-4 border border-border-subtle">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search by ticket ID, client name, phone number, message..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-bg-base border border-border-subtle text-xs text-white placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors font-medium"
          />
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 overflow-x-auto max-w-full">
          {/* Status filter pills */}
          <div className="flex bg-bg-base border border-border-subtle p-0.5 overflow-x-auto no-scrollbar shrink-0">
            {(["all", "open", "in_progress", "resolved"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 sm:px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === st
                    ? "bg-primary text-white italic"
                    : "text-text-muted hover:text-white"
                }`}
              >
                {st.replace("_", " ")} ({st === "all" ? counts.all : counts[st]})
              </button>
            ))}
          </div>

          {/* Category dropdown */}
          {uniqueCategories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-bg-base border border-border-subtle px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-white focus:border-primary focus:outline-none cursor-pointer shrink-0"
            >
              <option value="all">ALL CATEGORIES</option>
              {uniqueCategories.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Split Content: Tickets Table + Ticket Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Ticket List */}
        <div className={`${selectedTicket ? "lg:col-span-7" : "lg:col-span-12"} bg-bg-surface border border-border-subtle overflow-hidden transition-all`}>
          <div className="p-4 border-b border-border-subtle flex justify-between items-center bg-bg-surface">
            <div className="flex items-center gap-2">
              <LifeBuoy size={16} className="text-primary" />
              <h3 className="text-xs font-black uppercase tracking-widest text-white">
                Dispatched Support Tickets ({filteredTickets.length})
              </h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredTickets.length === 0 ? (
              <div className="p-16 text-center text-text-muted">
                <LifeBuoy size={36} className="mx-auto mb-3 opacity-30 text-primary" />
                <p className="text-xs font-bold uppercase tracking-widest">
                  {tickets.length === 0
                    ? "No support tickets submitted yet"
                    : "No tickets match the active filters"}
                </p>
                <p className="text-[10px] text-text-muted/60 mt-1">
                  Customer tickets submitted via the website Support form will instantly appear here.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle bg-bg-base/50 text-[9px] font-black uppercase tracking-widest text-text-muted">
                    <th className="p-4">Ticket ID</th>
                    <th className="p-4">Client / Phone</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Created</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-xs">
                  {filteredTickets.map((ticket) => {
                    const isSelected = selectedTicket?.id === ticket.id;
                    const createdDateStr = ticket.createdAt?.toDate
                      ? ticket.createdAt.toDate().toLocaleString("en-PH", {
                          timeZone: ASIA_TIMEZONE,
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Recently";

                    return (
                      <tr
                        key={ticket.id || ticket.ticketId}
                        onClick={() => {
                          setSelectedTicket(ticket);
                          setAdminNote(ticket.adminNotes || "");
                        }}
                        className={`cursor-pointer transition-colors hover:bg-white/5 ${
                          isSelected ? "bg-primary/10 border-l-4 border-l-primary" : ""
                        }`}
                      >
                        <td className="p-4 font-mono font-bold text-primary tracking-tight whitespace-nowrap">
                          {ticket.ticketId}
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-white uppercase tracking-tight truncate max-w-[140px]">
                            {ticket.clientName}
                          </div>
                          <div className="text-[10px] text-text-muted font-mono flex items-center gap-1 mt-0.5">
                            <Phone size={10} /> {ticket.phone}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="text-[10px] font-black uppercase tracking-wider text-text-muted bg-bg-base px-2 py-1 border border-border-subtle inline-block truncate max-w-[120px]">
                            {ticket.category}
                          </span>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          {getStatusBadge(ticket.status)}
                        </td>
                        <td className="p-4 text-[10px] text-text-muted whitespace-nowrap">
                          {createdDateStr}
                        </td>
                        <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {ticket.status === "open" && (
                              <button
                                onClick={() => handleUpdateStatus(ticket, "in_progress")}
                                className="p-1.5 border border-blue-500/30 text-blue-400 hover:bg-blue-500 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest"
                                title="Mark In Progress"
                              >
                                Process
                              </button>
                            )}
                            {ticket.status !== "resolved" && (
                              <button
                                onClick={() => handleUpdateStatus(ticket, "resolved")}
                                className="p-1.5 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest"
                                title="Mark Resolved"
                              >
                                <Check size={12} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteTicket(ticket)}
                              className="p-1.5 border border-red-500/20 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 transition-all"
                              title="Delete Ticket"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Ticket Detail Inspection Panel */}
        {selectedTicket && (
          <div className="lg:col-span-5 bg-bg-surface border border-border-subtle p-6 space-y-6">
            <div className="flex justify-between items-start border-b border-border-subtle pb-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                  SUPPORT TICKET DETAIL
                </span>
                <h3 className="text-xl font-black uppercase italic tracking-tighter text-white mt-1">
                  {selectedTicket.ticketId}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDeleteTicket(selectedTicket)}
                  className="p-2 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                  title="Delete this ticket"
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
                <button
                  onClick={() => setSelectedTicket(null)}
                  className="p-2 border border-border-subtle text-text-muted hover:text-white hover:border-white transition-all"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Client metadata grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-bg-base border border-border-subtle">
                <span className="text-[9px] font-black uppercase tracking-widest text-text-muted block mb-1">
                  Subscriber Name
                </span>
                <span className="font-bold text-white uppercase">{selectedTicket.clientName}</span>
              </div>
              <div className="p-3 bg-bg-base border border-border-subtle">
                <span className="text-[9px] font-black uppercase tracking-widest text-text-muted block mb-1">
                  Phone Number
                </span>
                <a
                  href={`tel:${selectedTicket.phone}`}
                  className="font-mono font-bold text-primary hover:underline"
                >
                  {selectedTicket.phone}
                </a>
              </div>
              <div className="p-3 bg-bg-base border border-border-subtle">
                <span className="text-[9px] font-black uppercase tracking-widest text-text-muted block mb-1">
                  Account / UID
                </span>
                <span className="font-mono text-white">
                  {selectedTicket.accountNumber || "N/A"}
                </span>
              </div>
              <div className="p-3 bg-bg-base border border-border-subtle">
                <span className="text-[9px] font-black uppercase tracking-widest text-text-muted block mb-1">
                  Category
                </span>
                <span className="font-bold text-amber-400 uppercase text-[11px]">
                  {selectedTicket.category}
                </span>
              </div>
            </div>

            {/* Additional Contact if different */}
            {selectedTicket.contact && selectedTicket.contact !== selectedTicket.phone && (
              <div className="p-3 bg-bg-base border border-border-subtle text-xs">
                <span className="text-[9px] font-black uppercase tracking-widest text-text-muted block mb-1">
                  Full Contact / Email
                </span>
                <span className="font-mono text-white">{selectedTicket.contact}</span>
              </div>
            )}

            {/* Message Body */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block">
                Client's Reported Issue / Concern:
              </span>
              <div className="p-4 bg-bg-base border border-border-subtle text-white text-xs leading-relaxed whitespace-pre-wrap font-sans">
                {selectedTicket.message}
              </div>
            </div>

            {/* Status change buttons */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block">
                Update Ticket Status:
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleUpdateStatus(selectedTicket, "open")}
                  className={`py-2.5 px-3 text-[9px] font-black uppercase tracking-widest border transition-all ${
                    selectedTicket.status === "open"
                      ? "bg-amber-500 text-black border-amber-500 font-black italic"
                      : "border-border-subtle text-text-muted hover:text-white"
                  }`}
                >
                  Open
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedTicket, "in_progress")}
                  className={`py-2.5 px-3 text-[9px] font-black uppercase tracking-widest border transition-all ${
                    selectedTicket.status === "in_progress"
                      ? "bg-blue-500 text-white border-blue-500 font-black italic"
                      : "border-border-subtle text-text-muted hover:text-white"
                  }`}
                >
                  In Progress
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedTicket, "resolved")}
                  className={`py-2.5 px-3 text-[9px] font-black uppercase tracking-widest border transition-all ${
                    selectedTicket.status === "resolved"
                      ? "bg-emerald-500 text-white border-emerald-500 font-black italic"
                      : "border-border-subtle text-text-muted hover:text-white"
                  }`}
                >
                  Resolved
                </button>
              </div>
            </div>

            {/* Admin Notes Section */}
            <div className="space-y-2 pt-2 border-t border-border-subtle">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block">
                Internal Admin Notes / Resolution Summary:
              </span>
              <textarea
                rows={3}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Log internal technician notes, actions taken, or resolution details..."
                className="w-full bg-bg-base border border-border-subtle p-3 text-xs text-white focus:outline-none focus:border-primary placeholder:text-text-muted"
              />
              <button
                onClick={() => handleSaveNote(selectedTicket)}
                disabled={updatingId === selectedTicket.id}
                className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white text-[9px] font-black uppercase tracking-widest italic transition-all"
              >
                Save Internal Note
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Delete Ticket Modal */}
      <AnimatePresence>
        {ticketToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160] bg-hot-black/90 flex items-center justify-center p-4 backdrop-blur-md"
            onClick={() => !isDeleting && setTicketToDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="sharp-card p-6 sm:p-8 max-w-sm w-full border-t-8 border-red-500 bg-bg-surface text-center shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 text-red-500 mx-auto flex items-center justify-center mb-5">
                <Trash2 size={28} />
              </div>
              <h3 className="text-lg font-black uppercase italic tracking-tighter text-white mb-2">
                PURGE SUPPORT <span className="text-red-500 not-italic">TICKET</span>?
              </h3>
              <p className="text-xs text-text-muted leading-relaxed mb-6">
                Are you sure you want to permanently delete support ticket{" "}
                <span className="text-white font-mono font-bold">#{ticketToDelete.ticketId}</span>{" "}
                submitted by{" "}
                <span className="text-primary font-bold">{ticketToDelete.clientName}</span>?
                This action cannot be undone.
              </p>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={confirmTicketDeletion}
                  disabled={isDeleting}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black uppercase text-xs tracking-widest italic transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Deleting Ticket...</span>
                    </>
                  ) : (
                    <span>Confirm Delete Ticket</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTicketToDelete(null)}
                  disabled={isDeleting}
                  className="w-full py-3 bg-transparent border border-border-subtle hover:border-white text-text-muted hover:text-white font-bold uppercase text-[11px] tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
