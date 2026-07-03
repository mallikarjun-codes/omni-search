const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // Get token from header
  const authHeader = req.header('Authorization');

  if (!authHeader) {
    return res.status(401).json({ message: 'No authorization token, access denied.' });
  }

  // Token format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ message: 'Token format is invalid. Must be Bearer <token>' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_company_rag_jwt_key_2026');
    req.user = decoded;
    if (req.user) {
      const rawId = decoded.id || decoded.userId;
      req.user.id = rawId ? String(rawId) : undefined;
      req.user.userId = rawId ? String(rawId) : undefined;
    }
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid or has expired.' });
  }
};
