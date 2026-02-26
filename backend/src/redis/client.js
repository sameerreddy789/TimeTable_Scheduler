const Redis = require('ioredis');
const { config } = require('../config');

const redis = new Redis(config.REDIS_URL);

module.exports = { redis };
