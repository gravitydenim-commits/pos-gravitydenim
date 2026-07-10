import { getApps } from 'firebase-admin/app';

export default function handler(req, res) {
  try {
    res.status(200).json({ success: true, apps: getApps().length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
