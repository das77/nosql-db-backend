const jwt = require('jsonwebtoken');
const sendError = require('../utils/sendError');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return sendError(res, 401, 'Authentication required');
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Shape must match what authorizePostMutation (step 3) expects: id as a string.
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (err) {
    // Expired gets its own message because it's the one failure a client can
    // act on by re-authenticating.
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    sendError(res, 401, message);
  }
}

module.exports = requireAuth;
