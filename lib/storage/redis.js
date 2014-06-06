var redis = require('redis');

var TYPE = 'redis';

var RedisDb = function(options) {
  this.type = TYPE;
  this.client = redis.createClient(options.port, options.host);
};
RedisDb.prototype.save = function(key, value, expire, onSuccess) {
  this.client.set(key.toString(), JSON.stringify(value), onSuccess);
  this.client.expire(key.toString(), expire);
};
RedisDb.prototype.load = function(key, callback) {
  this.client.get(key.toString(), function(error, reply) {
    callback(error, JSON.parse(reply));
  });
};

exports.type = TYPE;

exports.connect = function(options) {
  return new RedisDb(options);
};
