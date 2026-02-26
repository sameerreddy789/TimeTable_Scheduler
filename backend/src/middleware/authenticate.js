const { verifyToken, isTokenDenylisted } = require('../auth/jwt');

async function authenticate(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = verifyToken(token);

    const denylisted = await isTokenDenylisted(payload.jti);
    if (denylisted) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    req.user = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
    };

    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = { authenticate };
