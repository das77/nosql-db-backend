const { MongoMemoryServer } = require('mongodb-memory-server');

// One in-memory server for the entire run. Its URI isn't known until it starts,
// so it's published via process.env here rather than hardcoded in .env.test.
module.exports = async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  globalThis.__MONGOD__ = mongod;
};
