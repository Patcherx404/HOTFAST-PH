/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Key,
  Users,
  Search,
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Code2,
  Terminal,
  ShieldCheck,
  UserCheck,
  Zap,
  Globe,
  Radio,
  Clock,
  ArrowRight,
} from "lucide-react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { toast } from "sonner";
import { UserProfile } from "../types";
import { calculateNextRenewalCycle } from "../lib/billingEngine";

interface ClientApiTabProps {
  clients?: UserProfile[];
}

export function ClientApiTab({ clients = [] }: ClientApiTabProps) {
  // Target subscriber state
  const [selectedTargetUid, setSelectedTargetUid] = useState<string>("");
  const [subscriberSearch, setSubscriberSearch] = useState<string>("");

  // Form states
  const [clientIdInput, setClientIdInput] = useState<string>("");
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Wifi5Soft Server Webhook configuration
  const [wifi5SoftWebhookUrl, setWifi5SoftWebhookUrl] = useState<string>(() => {
    return localStorage.getItem("hf_wifi5soft_webhook") || "";
  });
  const [isTestingWebhook, setIsTestingWebhook] = useState<boolean>(false);

  // Test request state
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isRenewing, setIsRenewing] = useState<boolean>(false);

  // Automatically select the first subscriber if none is selected
  useEffect(() => {
    if (!selectedTargetUid && clients.length > 0) {
      const first = clients[0];
      setSelectedTargetUid(first.uid);
      setClientIdInput(first.clientId || `HF-${first.accountNumber || "CLIENT"}`);
      setApiKeyInput(first.apiKey || "");
    }
  }, [clients, selectedTargetUid]);

  // When selected subscriber changes, populate their existing Client ID & API Key
  const handleSelectSubscriber = (uid: string) => {
    setSelectedTargetUid(uid);
    const target = clients.find((c) => c.uid === uid);
    if (target) {
      setClientIdInput(target.clientId || `HF-${target.accountNumber || "CLIENT"}`);
      setApiKeyInput(target.apiKey || "");
      setTestResult(null);
    }
  };

  const selectedSubscriber = clients.find((c) => c.uid === selectedTargetUid);

  // Filter subscribers based on search term
  const filteredSubscribers = clients.filter((c) => {
    if (!subscriberSearch.trim()) return true;
    const q = subscriberSearch.toLowerCase();
    return (
      c.displayName?.toLowerCase().includes(q) ||
      c.accountNumber?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.clientId?.toLowerCase().includes(q)
    );
  });

  // Generator helpers
  const handleGenerateClientId = () => {
    if (!selectedSubscriber) {
      toast.error("Please select a target subscriber first");
      return;
    }
    const cleanAcc = (selectedSubscriber.accountNumber || "CLIENT").replace(/[^a-zA-Z0-9]/g, "");
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newId = `HF-${cleanAcc}-${randomHex}`;
    setClientIdInput(newId);
    toast.success("Generated new Client ID", { description: newId });
  };

  const handleGenerateApiKey = () => {
    const chars = "abcdef0123456789";
    let token = "";
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const newKey = `hf_live_${token}`;
    setApiKeyInput(newKey);
    setShowApiKey(true);
    toast.success("Generated secure API Key", { description: "Click 'Save & Sync' to apply" });
  };

  const handleCopy = (text: string, fieldName: string) => {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedField(fieldName);
      toast.success(`${fieldName} copied to clipboard!`);
      setTimeout(() => setCopiedField(null), 2500);
    } catch {
      toast.error("Failed to copy automatically.");
    }
  };

  // Save Client ID and API Key to target subscriber in Firestore and Sync Server
  const handleSaveToSubscriber = async () => {
    if (!selectedSubscriber) {
      toast.error("Please select a subscriber target.");
      return;
    }

    const trimmedClientId = clientIdInput.trim();
    const trimmedApiKey = apiKeyInput.trim();

    if (!trimmedClientId) {
      toast.error("Client ID cannot be empty.");
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading("Saving API credentials & syncing to server...");
    try {
      const userDocRef = doc(db, "users", selectedSubscriber.uid);
      const updates = {
        clientId: trimmedClientId,
        apiKey: trimmedApiKey,
        apiConfiguredAt: new Date().toISOString(),
      };

      await updateDoc(userDocRef, updates);

      // Save webhook to local storage if updated
      if (wifi5SoftWebhookUrl) {
        localStorage.setItem("hf_wifi5soft_webhook", wifi5SoftWebhookUrl.trim());
      }

      // Immediately synchronize server in-memory billing registry
      try {
        await fetch("/api/billing/subscribers/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscribers: [
              {
                ...selectedSubscriber,
                ...updates,
              },
            ],
          }),
        });
      } catch (_) {}

      toast.dismiss(toastId);
      toast.success("Credentials saved and synced!", {
        description: `Client ID: ${trimmedClientId} is now live on /api/clients`,
      });

      // Automatically run a test query to verify sync
      setTimeout(() => {
        handleRunApiTest();
      }, 300);
    } catch (err: any) {
      console.error("Failed to save client API credentials:", err);
      toast.dismiss(toastId);
      toast.error("Failed to save credentials", {
        description: err?.message || "Check permissions and try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Renew Subscription directly from Client API Tab with automatic sync to Wifi5Soft
  const handleQuickRenewSubscriber = async () => {
    if (!selectedSubscriber) return;

    const renewal = calculateNextRenewalCycle(
      selectedSubscriber.due_date,
      selectedSubscriber.due_time
    );

    const proceed = window.confirm(
      `Sync Renewal to Wifi5Soft for ${selectedSubscriber.displayName || selectedSubscriber.accountNumber}?\n\n` +
      `New Due Date: ${renewal.due_date} at ${renewal.due_time} PHT\n` +
      `Status: ACTIVE (Reactivated for Wifi5Soft / Router)\n` +
      `Client ID: ${clientIdInput.trim() || selectedSubscriber.clientId || "N/A"}\n\n` +
      `Proceed with instant renewal sync?`
    );
    if (!proceed) return;

    setIsRenewing(true);
    const toastId = toast.loading("Renewing subscriber and syncing to Wifi5Soft...");
    try {
      const renewedRecord = {
        due_date: renewal.due_date,
        due_time: renewal.due_time,
        dueDate: renewal.dueDateObj.toISOString(),
        subscription_status: "ACTIVE" as const,
        payment_status: "unpaid" as const,
        status: "active" as const, // CRITICAL: Sets status to active so Wifi5soft sees them active
        billStatus: "paid" as const,
        balance: 0,
        clientId: clientIdInput.trim() || selectedSubscriber.clientId || "",
        apiKey: apiKeyInput.trim() || selectedSubscriber.apiKey || "",
        lastStatusCheck: serverTimestamp(),
      };

      await updateDoc(doc(db, "users", selectedSubscriber.uid), renewedRecord);

      // Sync server memory registry immediately
      try {
        await fetch("/api/billing/subscribers/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscribers: [
              {
                ...selectedSubscriber,
                ...renewedRecord,
                dueDate: renewal.dueDateObj.toISOString(),
              },
            ],
          }),
        });
      } catch (_) {}

      // Push webhook to Wifi5Soft if configured
      if (wifi5SoftWebhookUrl && wifi5SoftWebhookUrl.trim().startsWith("http")) {
        try {
          await fetch(wifi5SoftWebhookUrl.trim(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKeyInput.trim() ? { "x-api-key": apiKeyInput.trim() } : {}),
            },
            body: JSON.stringify({
              event: "subscription.renewed",
              clientId: clientIdInput.trim() || selectedSubscriber.clientId,
              client_id: clientIdInput.trim() || selectedSubscriber.clientId,
              accountNumber: selectedSubscriber.accountNumber,
              status: "active",
              active: true,
              is_active: true,
              due_date: renewal.due_date,
              due_time: renewal.due_time,
              timestamp: new Date().toISOString(),
            }),
          });
        } catch (wbErr) {
          console.warn("Wifi5Soft webhook push warning:", wbErr);
        }
      }

      toast.dismiss(toastId);
      toast.success("Subscriber renewed and synchronized!", {
        description: `New deadline: ${renewal.due_date} at ${renewal.due_time} PHT (ACTIVE).`,
      });

      // Verify endpoint
      setTimeout(() => {
        handleRunApiTest();
      }, 300);
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Failed to renew subscriber", { description: err?.message });
    } finally {
      setIsRenewing(false);
    }
  };

  // Test API request using the configured Client ID
  const handleRunApiTest = async () => {
    const idToTest = clientIdInput.trim() || selectedSubscriber?.accountNumber || selectedSubscriber?.uid;
    if (!idToTest) {
      toast.error("Please enter a Client ID to test.");
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    const start = performance.now();
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(idToTest)}`, {
        headers: apiKeyInput.trim() ? { "x-api-key": apiKeyInput.trim() } : {},
      });
      const end = performance.now();
      const latency = Math.round(end - start);
      const data = await res.json().catch(() => ({}));

      setTestResult({
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        latency,
        data,
      });

      if (res.ok) {
        toast.success(`Wifi5Soft Sync Verified (HTTP ${res.status}) in ${latency}ms`);
      } else {
        toast.error(`Endpoint Returned HTTP ${res.status}`, {
          description: data?.error || "Review Client ID & API Key",
        });
      }
    } catch (err: any) {
      setTestResult({
        status: 500,
        statusText: "Network Exception",
        ok: false,
        latency: 0,
        data: { error: err?.message || "Failed to reach server" },
      });
      toast.error("Test request failed to execute");
    } finally {
      setIsTesting(false);
    }
  };

  // Test Webhook ping
  const handleTestWebhook = async () => {
    if (!wifi5SoftWebhookUrl || !wifi5SoftWebhookUrl.startsWith("http")) {
      toast.error("Enter a valid HTTP/HTTPS Wifi5Soft server URL first.");
      return;
    }
    setIsTestingWebhook(true);
    try {
      localStorage.setItem("hf_wifi5soft_webhook", wifi5SoftWebhookUrl.trim());
      const res = await fetch(wifi5SoftWebhookUrl.trim(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKeyInput.trim() ? { "x-api-key": apiKeyInput.trim() } : {}),
        },
        body: JSON.stringify({
          event: "ping",
          gateway: "Hotfast Philippines Core Billing",
          timestamp: new Date().toISOString(),
          clientId: clientIdInput.trim() || selectedSubscriber?.clientId || "TEST-CLIENT",
        }),
      });
      if (res.ok) {
        toast.success(`Wifi5Soft Server Responded HTTP ${res.status}`);
      } else {
        toast.warning(`Wifi5Soft Server returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      toast.error("Could not reach Wifi5Soft server directly (check IP/Port or CORS)", {
        description: err?.message,
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  // Clear / Revoke API credentials for the target subscriber
  const handleRevokeCredentials = async () => {
    if (!selectedSubscriber) return;
    if (
      !confirm(
        `Are you sure you want to revoke API credentials for ${
          selectedSubscriber.displayName || selectedSubscriber.accountNumber
        }?`
      )
    ) {
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading("Revoking API credentials...");
    try {
      const userDocRef = doc(db, "users", selectedSubscriber.uid);
      await updateDoc(userDocRef, {
        clientId: "",
        apiKey: "",
      });
      setClientIdInput("");
      setApiKeyInput("");
      setTestResult(null);
      toast.dismiss(toastId);
      toast.success("API credentials revoked for this subscriber.");
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Failed to revoke credentials", { description: err?.message });
    } finally {
      setIsSaving(false);
    }
  };

  const originUrl = typeof window !== "undefined" ? window.location.origin : "https://hotfast.online";
  const activeClientId = clientIdInput.trim() || "HF-CLIENT-ID";
  const fullWifi5SoftQueryUrl = `${originUrl}/api/clients/${activeClientId}${
    apiKeyInput.trim() ? `?api_key=${apiKeyInput.trim()}` : ""
  }`;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-border-subtle rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-lg shadow-cyan-500/10">
            <Radio size={24} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black uppercase tracking-widest text-white italic">
                Wifi5Soft &amp; Client API Sync
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-mono font-bold uppercase">
                Active Sync Engine
              </span>
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Assign Client ID &amp; API Key for Wifi5Soft server syncing and automated subscriber reactivation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-black/40 px-3 py-1.5 rounded-lg border border-border-subtle">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Gateway: /api/clients/:clientId</span>
        </div>
      </div>

      {/* Sync Status Banner for Selected Subscriber */}
      {selectedSubscriber && (
        <div className="p-4 bg-slate-900/60 border border-cyan-500/30 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Zap size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Wifi5Soft Sync Status:
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase ${
                    selectedSubscriber.status === "active" || selectedSubscriber.subscription_status === "ACTIVE"
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-700"
                      : "bg-red-950 text-red-400 border border-red-700"
                  }`}
                >
                  {selectedSubscriber.status === "active" || selectedSubscriber.subscription_status === "ACTIVE"
                    ? "ACTIVE • UNLOCKED"
                    : "SUSPENDED / EXPIRED"}
                </span>
                <span className="text-[10px] font-mono text-cyan-300">
                  Due: {selectedSubscriber.due_date || "N/A"} {selectedSubscriber.due_time || ""}
                </span>
              </div>
              <p className="text-[10px] text-text-muted mt-0.5 font-mono">
                Assigned to: <strong className="text-white">{selectedSubscriber.displayName || selectedSubscriber.accountNumber}</strong> • Client ID: <span className="text-cyan-400 font-bold">{clientIdInput || selectedSubscriber.clientId || "Unassigned"}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={handleQuickRenewSubscriber}
              disabled={isRenewing}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-wider italic rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
              title="Advances due date by +30 days, sets status to ACTIVE, and synchronizes to Wifi5Soft"
            >
              <RefreshCw size={12} className={isRenewing ? "animate-spin" : ""} />
              <span>{isRenewing ? "Syncing Renewal..." : "Renew & Sync to Wifi5Soft (+30D)"}</span>
            </button>
            <button
              type="button"
              onClick={handleRunApiTest}
              disabled={isTesting}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-mono font-bold uppercase rounded-lg border border-cyan-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Terminal size={12} className={isTesting ? "animate-spin" : ""} />
              <span>Verify Sync</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Select Subscriber Target (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-bg-surface border border-border-subtle rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              <label className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                <Users size={14} className="text-cyan-400" />
                <span>Select Subscriber Target</span>
              </label>
              <span className="text-[9px] font-mono font-bold text-text-muted">
                {filteredSubscribers.length} subscribers
              </span>
            </div>

            {/* Search Input */}
            <div className="relative mb-3">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                placeholder="Search subscriber name, account #, email, or client ID..."
                value={subscriberSearch}
                onChange={(e) => setSubscriberSearch(e.target.value)}
                className="w-full bg-bg-surface-elevated/70 border border-border-subtle rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-text-muted/50 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            {/* Subscriber List */}
            <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {filteredSubscribers.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-xs">
                  No subscribers match your search.
                </div>
              ) : (
                filteredSubscribers.map((subscriber) => {
                  const isSelected = subscriber.uid === selectedTargetUid;
                  const hasClientId = Boolean(subscriber.clientId);
                  const isSuspended = subscriber.status === "suspended";

                  return (
                    <div
                      key={subscriber.uid}
                      onClick={() => handleSelectSubscriber(subscriber.uid)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-cyan-950/40 border-cyan-500/80 shadow-md ring-1 ring-cyan-500/30"
                          : "bg-bg-surface-elevated/40 border-border-subtle hover:border-border-muted hover:bg-bg-surface-elevated/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-white truncate">
                              {subscriber.displayName || "Subscriber"}
                            </span>
                            {isSelected && (
                              <UserCheck size={12} className="text-cyan-400 shrink-0" />
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-text-muted truncate mt-0.5">
                            Acc: <span className="text-slate-300">{subscriber.accountNumber || "N/A"}</span> • {subscriber.email || "No email"}
                          </div>
                          {subscriber.clientId && (
                            <div className="text-[9px] font-mono text-cyan-400 truncate mt-0.5">
                              ID: {subscriber.clientId}
                            </div>
                          )}
                        </div>

                        {/* Status Badges */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase font-mono ${
                              isSuspended
                                ? "bg-red-950/60 text-red-400 border border-red-800/50"
                                : "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50"
                            }`}
                          >
                            {isSuspended ? "suspended" : "active"}
                          </span>
                          {hasClientId ? (
                            <span className="text-[8px] font-mono text-cyan-400 bg-cyan-950/50 px-1 py-0.2 rounded border border-cyan-800/40">
                              Synced
                            </span>
                          ) : (
                            <span className="text-[8px] font-mono text-text-muted">
                              Not Synced
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Fill Up Client ID & API Key & Wifi5Soft Config (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-bg-surface border border-border-subtle rounded-xl p-5 shadow-sm space-y-5">
            {/* Selected Subscriber Details Card */}
            {selectedSubscriber ? (
              <div className="p-3.5 bg-bg-surface-elevated/50 border border-border-subtle rounded-lg flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-text-muted">
                    Target Subscriber
                  </span>
                  <div className="text-sm font-black text-white truncate">
                    {selectedSubscriber.displayName || "Unnamed Subscriber"}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">
                    Account: <span className="text-white">{selectedSubscriber.accountNumber || "N/A"}</span> • UID: <span className="text-slate-400">{selectedSubscriber.uid.slice(0, 10)}...</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[9px] font-mono text-text-muted block">Current Plan</span>
                  <span className="text-xs font-black uppercase text-cyan-400">
                    {selectedSubscriber.currentPlanId || "Standard Node"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-950/20 border border-amber-800/40 rounded-lg text-amber-400 text-xs flex items-center gap-2">
                <AlertCircle size={14} />
                <span>Select a subscriber from the left to configure credentials.</span>
              </div>
            )}

            {/* Field: Client ID */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-cyan-400" />
                  <span>Client ID</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateClientId}
                    className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={10} />
                    <span>Auto-Generate</span>
                  </button>
                  {clientIdInput && (
                    <button
                      type="button"
                      onClick={() => handleCopy(clientIdInput, "Client ID")}
                      className="text-[10px] font-mono text-text-muted hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField === "Client ID" ? (
                        <Check size={10} className="text-emerald-400" />
                      ) : (
                        <Copy size={10} />
                      )}
                      <span>Copy</span>
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                placeholder="e.g. HF-CLIENT-1002"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                className="w-full bg-bg-surface-elevated border border-border-subtle rounded-lg px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-text-muted/40 focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <p className="text-[10px] text-text-muted font-mono">
                Enter the exact Client ID configured on your Wifi5Soft server.
              </p>
            </div>

            {/* Field: API Key */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-1.5">
                  <Key size={13} className="text-cyan-400" />
                  <span>API Key</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateApiKey}
                    className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={10} />
                    <span>Generate Key</span>
                  </button>
                  {apiKeyInput && (
                    <button
                      type="button"
                      onClick={() => handleCopy(apiKeyInput, "API Key")}
                      className="text-[10px] font-mono text-text-muted hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField === "API Key" ? (
                        <Check size={10} className="text-emerald-400" />
                      ) : (
                        <Copy size={10} />
                      )}
                      <span>Copy</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  placeholder="e.g. hf_live_3f8a91c2b5d4e7f8..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full bg-bg-surface-elevated border border-border-subtle rounded-lg pl-3.5 pr-10 py-2.5 text-xs font-mono text-white placeholder:text-text-muted/40 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors cursor-pointer"
                  title={showApiKey ? "Hide Key" : "Show Key"}
                >
                  {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[10px] text-text-muted font-mono">
                API Key for authentication via `x-api-key` header or `?api_key=` parameter.
              </p>
            </div>

            {/* Optional: Wifi5Soft Server Webhook / Notification URL */}
            <div className="space-y-1.5 pt-2 border-t border-border-subtle">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-1.5">
                  <Globe size={13} className="text-emerald-400" />
                  <span>Wifi5Soft Server Webhook URL (Optional)</span>
                </label>
                {wifi5SoftWebhookUrl && (
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={isTestingWebhook}
                    className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={10} className={isTestingWebhook ? "animate-spin" : ""} />
                    <span>Ping Server</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="e.g. http://192.168.1.1:8080/api/renew or https://my-server.com/api/sync"
                value={wifi5SoftWebhookUrl}
                onChange={(e) => setWifi5SoftWebhookUrl(e.target.value)}
                className="w-full bg-bg-surface-elevated border border-border-subtle rounded-lg px-3.5 py-2 text-xs font-mono text-white placeholder:text-text-muted/40 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <p className="text-[10px] text-text-muted font-mono">
                If configured, Hotfast will automatically POST renewal updates directly to this server URL whenever a subscriber renews.
              </p>
            </div>

            {/* Actions Bar */}
            <div className="pt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveToSubscriber}
                  disabled={isSaving || !selectedSubscriber}
                  className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider italic rounded-lg flex items-center gap-2 transition-all shadow-md shadow-cyan-900/30 cursor-pointer"
                >
                  {isSaving ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Save size={13} />
                  )}
                  <span>Save &amp; Sync Credentials</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunApiTest}
                  disabled={isTesting || !clientIdInput}
                  className="px-4 py-2.5 bg-bg-surface-elevated hover:bg-bg-surface-elevated/80 border border-border-subtle text-white text-xs font-black uppercase tracking-wider italic rounded-lg flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Terminal size={13} className={isTesting ? "animate-spin text-cyan-400" : "text-cyan-400"} />
                  <span>{isTesting ? "Testing..." : "Verify Wifi5Soft API"}</span>
                </button>
              </div>

              {selectedSubscriber?.apiKey && (
                <button
                  type="button"
                  onClick={handleRevokeCredentials}
                  disabled={isSaving}
                  className="px-3 py-2 text-[10px] font-mono font-bold text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded border border-red-900/30 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={11} />
                  <span>Revoke</span>
                </button>
              )}
            </div>

            {/* Test Query Response Box */}
            {testResult && (
              <div className="p-4 bg-slate-950 border border-border-subtle rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase ${
                        testResult.ok
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : "bg-red-950 text-red-400 border border-red-800"
                      }`}
                    >
                      HTTP {testResult.status} {testResult.statusText}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">
                      Status: {testResult.data?.status?.toUpperCase() || "UNKNOWN"}
                    </span>
                    <span className="text-[10px] font-mono text-text-muted">
                      {testResult.latency}ms
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(JSON.stringify(testResult.data, null, 2), "Test Response")}
                    className="text-[10px] font-mono text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Copy size={10} />
                    <span>Copy JSON</span>
                  </button>
                </div>
                <pre className="text-[11px] font-mono text-slate-300 max-h-[160px] overflow-auto bg-black/60 p-3 rounded custom-scrollbar">
                  {JSON.stringify(testResult.data, null, 2)}
                </pre>
              </div>
            )}

            {/* Wifi5Soft Dedicated Configuration Box */}
            <div className="p-4 bg-bg-surface-elevated/40 border border-border-subtle rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                  <Radio size={12} className="text-cyan-400" />
                  <span>Wifi5Soft Endpoint URL to Configure on your Server</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(fullWifi5SoftQueryUrl, "Wifi5Soft Query URL")}
                  className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                >
                  <Copy size={10} />
                  <span>Copy URL</span>
                </button>
              </div>
              <div className="p-2.5 bg-black/60 rounded border border-border-subtle/50 text-[11px] font-mono text-cyan-300 break-all select-all">
                {fullWifi5SoftQueryUrl}
              </div>
              <div className="text-[10px] text-text-muted font-mono space-y-1">
                <div>• <strong>Method:</strong> GET</div>
                <div>• <strong>Checks:</strong> `status: "active"`, `active: true`, `due_date`, `expiry`</div>
                <div>• <strong>When renewed on website:</strong> Immediate sync updates status to ACTIVE and unblocks client.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
