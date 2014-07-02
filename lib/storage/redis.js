'use strict';

var redis = require('redis');

var TYPE = exports.type = 'redis';

var RedisDb = function(options) {
  var redisOptions = {
    'return_buffers': true
  };

  this.type = TYPE;
  this.client = redis.createClient(options.port, options.host, redisOptions);
};

RedisDb.prototype.save = function(key, value, expire, onSuccess) {
  key = key.toString();
  this.client.hmset(key, value, onSuccess);
  if (expire !== undefined) {
    this.client.expire(key, expire, function() {
      // Ignore expire command errors.
    });
  }
};

RedisDb.prototype.load = function(key, callback) {
  key = key.toString();
  this.client.hgetall(key, callback);
};

exports.connect = function(options) {
  return new RedisDb(options);
};
