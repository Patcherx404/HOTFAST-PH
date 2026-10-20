import liveChatHandler from './_telegram/live-chat';
import settlementHandler from './_telegram/payment-settlement';
import settingsHandler from './_telegram/settings';
import testHandler from './_telegram/test';

export default async function handler(req: any, res: any) {
  const url = req.url || '';
  const action = req.query?.action;

  if (action === 'live-chat' || url.includes('/live-chat')) {
    return liveChatHandler(req, res);
  }
  if (action === 'payment-settlement' || url.includes('/payment-settlement')) {
    return settlementHandler(req, res);
  }
  if (action === 'test' || url.includes('/test')) {
    return testHandler(req, res);
  }
  if (action === 'settings' || url.includes('/settings')) {
    return settingsHandler(req, res);
  }

  // Default fallback to settings
  return settingsHandler(req, res);
}
