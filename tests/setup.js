const path = require('path');
const mongoose = require('mongoose');

// The app's own dotenv.config() lives in src/server.js, which tests never load —
// Supertest imports src/app.js directly. So the test env is loaded here instead.
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
});

afterEach(async () => {
  // Clear rather than drop: dropping would discard the schema's indexes, and the
  // duplicate-key tests depend on the unique indexes on username/email existing.
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
});
