export default async function handler(req, res) {
  try {
    const firebaseAdmin = await import('../../src/lib/firebaseAdmin');
    const auth = firebaseAdmin.getAdminAuth();
    res.status(200).json({ success: true, hasAuth: !!auth });
  } catch (error) {
    res.status(500).json({ 
      error: 'Dynamic import failed', 
      message: error.message, 
      stack: error.stack 
    });
  }
}

