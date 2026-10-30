import { sessionHandler } from '../_lib';

export default function handler(req: any, res: any) {
  return sessionHandler(req, res);
}
