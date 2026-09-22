import type { VercelRequest, VercelResponse } from "../../support";
import handler from "../generate";

export default async function qrHandler(req: VercelRequest, res: VercelResponse) {
  return handler(req, res);
}
