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
  wifi5softAccountId?: string; // Link to a specific WiFi5Soft configuration
  displayName: string;
  email: string;
  address: string;
  currentPlanId: string;
  balance: number;
  dueDate?: any; // Timestamp
  billStatus?: 'paid' | 'due' | 'overdue';
  status?: 'active' | 'suspended';
}

export interface WiFi5SoftAccount {
  id: string;
  name: string;
  ownerEmail?: string;
  clientId: string;
  apiKey: string;
  updatedAt?: any;
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
  amount: number;
  date: string;
  method: 'GCash' | 'Maya' | 'Card' | 'Bank';
  status: 'completed' | 'pending' | 'failed';
  referenceNumber: string;
  screenshotUrl?: string;
  createdAt?: any;
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
