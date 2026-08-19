const jwt = require('jsonwebtoken');
const User = require('../models/User');
const sendError = require('../utils/sendError');

const TOKEN_EXPIRY = '1h';

function signToken(user) {
  // id is stringified explicitly so requireAuth's req.user.id matches what
  // authorizePostMutation compares against (post.author.toString()).
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// select: false does NOT protect the register response: User.create() returns the
// document just built, with the (hashed) password populated — select only applies
// to documents loaded by a query. Building the response explicitly means the
// password cannot leak by construction.
function publicUser(user) {
  return { id: user._id.toString(), username: user.username, email: user.email, role: user.role };
}

// POST /api/auth/register
async function register(req, res) {
  try {
    // Whitelist: role is deliberately excluded — a client must not be able to
    // self-register as admin; the schema default ('user') applies.
    const { username, email, password } = req.body;
    const user = await User.create({ username, email, password });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return sendError(res, 400, 'Validation failed',
        Object.values(err.errors).map((e) => e.message));
    }
    if (err.code === 11000) {
      // Duplicate username/email is a unique-index violation, not a
      // ValidationError. 409 (not 400): the request was well-formed, it
      // conflicts with existing state.
      return sendError(res, 409, 'Username or email already in use');
    }
    console.error(err);
    sendError(res, 500, 'Internal server error');
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    // The schema lowercases email on save but not on query — normalize here or
    // a user who typed Ada@example.com at registration could never log in.
    const email = String(req.body.email).toLowerCase().trim();
    // .select('+password') is mandatory here and only here (see User.js).
    const user = await User.findOne({ email }).select('+password');
    // One message for both failure modes — do not reveal whether the account exists.
    if (!user || !(await user.comparePassword(req.body.password))) {
      return sendError(res, 401, 'Invalid email or password');
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error');
  }
}

module.exports = { register, login };
