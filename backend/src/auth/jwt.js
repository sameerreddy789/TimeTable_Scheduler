const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { redis } = require('../redis/client');

const EXPIRY_SECONDS = 8 * 60 * 60; // 8 hours

function signToken(payload) {
  return jwt.sign(payload, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: EXPIRY_SECONDS,
  });
}

function verifyToken(token) {
  return jwt.verify(token, config.JWT_SECRET);
}

async function denylistToken(jti, expiresAt) {
  const ttl = expiresAt - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    await redis.set(`denylist:${jti}`, '1', 'EX', ttl);
  }
}

async function isTokenDenylisted(jti) {
  const val = await redis.get(`denylist:${jti}`);
  return val !== null;
}

module.exports = { signToken, verifyToken, denylistToken, isTokenDenylisted };
