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
