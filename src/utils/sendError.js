// Interim error responder. Replaced by the centralized error middleware in step 5;
// the response shape is already the final one so consumers don't see a break.
function sendError(res, status, message, details = null) {
  res.status(status).json({ error: { message, status, details } });
}

module.exports = sendError;
