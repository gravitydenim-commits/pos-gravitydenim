import { getAdminAuth } from '../../src/lib/firebaseAdmin';

export default function handler(req, res) {
  try {
    const auth = getAdminAuth();
    res.status(200).json({ success: true, hasAuth: !!auth });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
