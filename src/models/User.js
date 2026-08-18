const mongoose = require('mongoose');

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

module.exports = mongoose.model('User', userSchema);
