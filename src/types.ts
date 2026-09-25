/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface InternetPlan {
  id: string;
  name: string;
  speed: number; // in Mbps
  bandwidth: string; // e.g. "Unlimited" or "500GB"
  price: number; // in PHP
  features: string[];
  isPopular?: boolean;
  updatedAt?: any;
}

export interface UserProfile {
  uid: string;
  accountNumber: string;
  clientId?: string;
  displayName: string;
  email: string;
  phone?: string;
  address: string;
  currentPlanId: string;
  balance: number;
  dueDate?: any; // Timestamp / legacy date
  billStatus?: 'paid' | 'due' | 'overdue';
  status?: 'active' | 'suspended';
  // Automated subscriber billing status fields
  due_date?: string; // e.g. "2026-09-23"
  due_time?: string; // e.g. "12:00 PM"
  payment_status?: 'unpaid' | 'processing' | 'paid' | 'rejected';
  subscription_status?: 'ACTIVE' | 'DUE' | 'OVERDUE' | 'PAID';
  lastStatusCheck?: any;
}

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'alert';
  read: boolean;
  createdAt: any; // Timestamp
}

export interface PaymentRecord {
  id: string;
  userId: string;
  customerName?: string;
  accountNumber?: string;
  amount: number;
  date?: string;
  method: 'QR Ph' | 'QR Ph (PayMongo)' | 'GCash' | 'Maya' | 'Card' | 'Bank' | string;
  status: 'pending' | 'confirmed' | 'rejected' | 'completed' | 'failed';
  referenceNumber: string;
  screenshotUrl?: string;
  rejectionReason?: string;
  qrId?: string;
  qrString?: string;
  qrImage?: string;
  planName?: string;
  createdAt?: any;
  updatedAt?: any;
  audit?: {
    actionBy: string;
    actionByUid?: string;
    actionAt: any;
    decision: 'confirmed' | 'rejected';
    notes?: string;
  };
}

export interface BillingCycle {
  id: string;
  name: string;
  startDate: any; // Timestamp
  endDate: any; // Timestamp
  dueDate: any; // Timestamp
  status: 'active' | 'archived';
  createdAt: any; // Timestamp
}

export interface ChatSession {
  id: string; // usually matches userId
  userId: string;
  userName: string;
  lastMessage?: string;
  lastMessageAt?: any;
  unreadCount?: number;
  updatedAt: any;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderRole: 'user' | 'admin';
  createdAt: any;
}

export interface SupportTicket {
  id?: string;
  ticketId: string;
  clientName: string;
  accountNumber?: string;
  contact?: string;
  phone: string;
  category: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  userId?: string;
  createdAt: any;
  resolvedAt?: any;
  adminNotes?: string;
}
