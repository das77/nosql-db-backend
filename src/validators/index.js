const { body, validationResult } = require('express-validator');
const sendError = require('../utils/sendError');

// These chains deliberately duplicate the Mongoose schema rules: they reject bad
// input before a database round-trip and report all field errors at once. The
// schema stays as the last line of defense (defense in depth, not redundancy).

const registerValidation = [
  body('username').trim().isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters'),
  body('email').trim().isEmail()
    .withMessage('Email must be a valid email address'),
  // Never trim() a password — leading/trailing whitespace is significant.
  body('password').isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
];

const loginValidation = [
  body('email').trim().isEmail()
    .withMessage('Email must be a valid email address'),
  body('password').notEmpty()
    .withMessage('Password is required')
];

// Shared per-field rules for posts; create requires title/body, update makes
// every field optional. No author chain — it comes from the token, never the body.
function postFieldRules({ optional }) {
  const title = body('title').isLength({ min: 3, max: 120 })
    .withMessage('Title must be between 3 and 120 characters');
  const bodyField = body('body').isLength({ min: 10 })
    .withMessage('Body must be at least 10 characters');
  return [
    optional ? title.optional() : title,
    optional ? bodyField.optional() : bodyField,
    body('status').optional().isIn(['draft', 'published', 'archived'])
      .withMessage('Status must be draft, published, or archived'),
    body('tags').optional().isArray()
      .withMessage('Tags must be an array of strings')
  ];
}

const postCreateValidation = postFieldRules({ optional: false });
const postUpdateValidation = postFieldRules({ optional: true });

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // details is a flat array of message strings — the same shape the Mongoose
    // ValidationError branches produce, so clients see one consistent 400.
    return sendError(res, 400, 'Validation failed', errors.array().map((e) => e.msg));
  }
  next();
}

module.exports = {
  registerValidation,
  loginValidation,
  postCreateValidation,
  postUpdateValidation,
  handleValidationErrors
};
