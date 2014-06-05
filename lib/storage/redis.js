var redis = require('redis');

var TYPE = 'redis';

var RedisDb = function() {
  this.type = TYPE;
  this.client = redis.createClient();
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

exports.connect = function() {
  return new RedisDb();
};
