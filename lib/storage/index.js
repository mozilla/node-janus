var basic = require('./basic');
var redis = require('./redis');

// Available database modules.
var DATABASES = [basic, redis];

// Creates a new storage connected to given database.
var Storage = function(db) {
  this.db = db;
  this.size = 0;
  this.memSize = 0;
  console.log('### new %s storage created', this.db.type);
};
Storage.prototype.save = function(key, value, expire) {
  var that = this;
  var memSize = value.size;

  function onSuccess() {
    that.size += 1;
    that.memSize += memSize;
    console.log('+++ storage %d items %d MB', that.size,
        (that.memSize / 1048576).toFixed(2));
  }

  function onExpire() {
    that.size -= 1;
    that.memSize -= memSize;
    console.log('--- storage %d items %d MB', that.size,
        (that.memSize / 1048576).toFixed(2));
  }

  this.db.save(key, value, expire, onSuccess, onExpire);
};
Storage.prototype.load = function(key, callback) {
  this.db.load(key, callback);
};

// Creates a new storage instance connected to given database type.
exports.create = function(type) {
  var db = null;

  DATABASES.forEach(function(d) {
    if (d.type === type) {
      db = d.connect();
    }
  });

  return db && new Storage(db);
};
