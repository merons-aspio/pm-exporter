import { sessionHandler } from '../_lib.js';

export default function handler(req: any, res: any) {
  return sessionHandler(req, res);
}
