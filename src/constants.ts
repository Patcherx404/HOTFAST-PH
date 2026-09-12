/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternetPlan } from './types';

export const INTERNET_PLANS: InternetPlan[] = [
  {
    id: 'starter',
    name: 'Lite Fiber',
    speed: 50,
    bandwidth: 'Unlimited',
    price: 999,
    features: ['Unlimited Data', 'Free Installation', '24/7 Support'],
  },
  {
    id: 'pro',
    name: 'Pro Fiber',
    speed: 200,
    bandwidth: 'Unlimited',
    price: 1899,
    features: ['Unlimited Data', 'Priority Support', 'Public IP Option', 'Free Dual-Band Router'],
    isPopular: true,
  },
  {
    id: 'ultra',
    name: 'Ultra Fiber',
    speed: 600,
    bandwidth: 'Unlimited',
    price: 2899,
    features: ['Unlimited Data', 'VVIP Support', 'Next-Gen Router', 'Static IP Included'],
  },
  {
    id: 'gigabit',
    name: 'Giga Fiber',
    speed: 1000,
    bandwidth: 'Unlimited',
    price: 4999,
    features: ['Ultimate Speed', 'Dedicated Business Line', 'White-Glove Installation'],
  },
];

export const HOTFAST_NODE_COORDS = {
  lat: 10.509848359158417,
  lng: 122.82730190382401,
  nodeName: "HF-NODE-VISAYAS-01",
  region: "Western Visayas (Negros Occidental)",
  networkType: "Ultra-Low Latency Fiber & Microwave Backbone",
};

export const ADMIN_EMAIL = "projectile.afk@gmail.com";

export function isAuthorizedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
