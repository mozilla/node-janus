'use strict';

var storage = require('./storage');
var ut = require('./util');
var log = require('./log');

// Resource caching interface, creates a new storage.
var Cache = function(options) {
  this.maxSize = options.cache.items.limit;
  this.maxMemSize = options.cache.memory.limit &&
                    ut.mbToByte(options.cache.memory.limit);
  this.storage = storage.create({
    type: options.cache.type,
    maxSize: this.maxSize,
    maxMemSize: this.maxMemSize,
    host: options.cache.database.host,
    port: options.cache.database.port
  });
};

// Save the key-value item with given expire time in ms.
Cache.prototype.save = function(key, value, expire) {
  this.storage.save(key, value, expire);
};

// Load the item for given key, return result via callback call.
Cache.prototype.load = function(key, callback) {
  this.storage.load(key, callback);
};

// Default cache instance.
var instance = null;

// Initializes a new cache for given storage type.
exports.init = function(options) {
  instance = new Cache(options);
};

// Saves new cache entry.
exports.save = function(key, value, expire) {
  if (instance) {
    instance.save(key, value, expire);
  } else {
    log.error('No cache instance!');
  }
};

// Returns cache entry for given key if available.
exports.load = function(key, callback) {
  if (instance) {
    instance.load(key, callback);
  } else {
    log.error('No cache instance!');
    callback();
  }
};
