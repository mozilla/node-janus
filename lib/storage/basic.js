'use strict';

var basicCache = require('memory-cache');

var TYPE = 'basic';

// Basic in-memory pure JS database.
var BasicDb = function() {
  this.type = TYPE;
};
BasicDb.prototype.save = function(key, value, expire, onSuccess, onExpire) {
  basicCache.put(key, value, expire * 1000, onExpire);
  onSuccess();
};
BasicDb.prototype.load = function(key, callback) {
  var value = basicCache.get(key);
  callback(null, value);
};

var instance = new BasicDb();

exports.type = TYPE;

exports.connect = function() {
  return instance;
};
