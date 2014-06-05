var storage = require('./storage');

var DEF_MAX_SIZE = 3000;

// Resource caching interface, creates a new storage.
var Cache = function(options) {
  this.maxSize = options.maxCacheSize || DEF_MAX_SIZE;
  this.storage = storage.create(options.cache.type);
};
Cache.prototype.save = function(key, value, expire) {
  this.storage.save(key, value, expire);
};
Cache.prototype.load = function(key, callback) {
  this.storage.load(key, callback);
};

// Default cache instance.
var instance = null;

// Initializes a new cache for given storage type.
exports.init = function(options) {
  if (options.cache.use) {
    instance = new Cache(options);
  }
};

// Saves new cache entry.
exports.save = function(key, value, expire) {
  if (instance) {
    instance.save(key, value, expire);
  }
};

// Returns cache entry for given key if available.
exports.load = function(key, callback) {
  if (instance) {
    instance.load(key, callback);
  } else {
    callback();
  }
};
