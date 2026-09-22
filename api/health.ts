import type { VercelRequest, VercelResponse } from "./support";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
}
