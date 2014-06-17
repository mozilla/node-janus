'use strict';

var basic = require('./basic');
var redis = require('./redis');
var ut = require('../util');
var log = require('../log');

// Available database modules.
var DATABASES = [basic, redis];

// Creates a new storage connected to given database.
var Storage = function(options, db) {
  this.maxSize = options.maxSize;
  this.maxMemSize = options.maxMemSize;
  this.db = db;
  this.size = 0;
  this.memSize = 0;
  log.debug('*** new %s storage created [%d | %d MB]', this.db.type,
      this.maxSize, ut.byteToMb(this.maxMemSize).toFixed(2));
};
Storage.prototype.save = function(key, value, expire) {
  var that = this;
  var memSize = value.size;

  if (this.maxSize && this.size === this.maxSize ||
      this.maxMemSize && this.memSize + memSize >= this.maxMemSize) {
    // TODO(esawin): eviction strategy.
    log.debug('=== storage full [%d | %d MB]', this.size,
        ut.byteToMb(this.memSize).toFixed(2));
    return;
  }

  function onSuccess() {
    that.size += 1;
    that.memSize += memSize;
    log.debug('+++ storage [%d | %d MB]', that.size,
        ut.byteToMb(that.memSize).toFixed(2));
  }

  function onExpire() {
    that.size -= 1;
    that.memSize -= memSize;
    log.debug('--- storage [%d | %d MB]', that.size,
        ut.byteToMb(that.memSize).toFixed(2));
  }

  this.db.save(key, value, expire, onSuccess, onExpire);
};
Storage.prototype.load = function(key, callback) {
  this.db.load(key, callback);
};

// Creates a new storage instance connected to given database type.
exports.create = function(options) {
  var db = null;

  DATABASES.forEach(function(d) {
    if (d.type === options.type) {
      db = d.connect(options);
    }
  });

  return db && new Storage(options, db);
};
