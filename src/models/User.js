const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

// Deliberately permissive; real-world email validity is confirmed by delivery, not regex.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username must be at most 30 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    // lowercase makes the unique constraint case-insensitive in practice:
    // Ada@example.com and ada@example.com can't both register.
    lowercase: true,
    match: [EMAIL_REGEX, 'Email must be a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    // select: false means the login controller must use .select('+password') to read it.
    select: false
  },
  role: {
    type: String,
    enum: { values: ['user', 'admin'], message: 'Role must be either user or admin' },
    default: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash only when the plaintext actually changed, so unrelated saves (a future
// profile update) don't re-hash an already-hashed value.
// Hook ordering is load-bearing: Mongoose runs validators BEFORE pre('save'),
// so minlength: 8 validates the plaintext, not the 60-char hash. That is the
// behavior we want — do not "fix" this into a pre('validate') hook.
// Mongoose 9 dropped the legacy next()-callback hook style: an async function
// that returns (or throws) is now the only supported signature for pre('save').
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) {
    return;
  }
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

// Requires the document to have been loaded with .select('+password') — it
// silently compares against undefined otherwise. Only the login flow does this.
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
