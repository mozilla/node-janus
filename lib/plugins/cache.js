'use strict';

var cache = require('../cache');

var MAX_EXPIRE = 7 * 24 * 60 * 60;
// var DEF_EXPIRE = 1 * 24 * 60 * 60;
// Default for testing.
var DEF_EXPIRE = 30;

var NAME = exports.name = 'cache';

var emitter = require('../emit').get(NAME);

// Parses cache control header and last-modified.
function parseCacheControl(headers) {
  var lastMod = headers['last-modified'];
  var expires = headers.expires;

  var cacheHeaders = {
    'last-modified': lastMod ? new Date(lastMod) : null,
    expires: expires ? new Date(expires) : null
  };

  var cacheControl = headers['cache-control'];
  if (cacheControl) {
    cacheControl.split(',').forEach(function(elem) {
      elem = elem.trim();
      var i = elem.indexOf('=');
      if (i === -1) {
        cacheHeaders[elem] = true;
      } else {
        cacheHeaders[elem.substr(0, i)] = elem.substr(i + 1);
      }
    });
  }

  return cacheHeaders;
}

// Returns the expire time in seconds.
function maxAge(cacheHeaders) {
  var expire = cacheHeaders['s-maxage'] || cacheHeaders['max-age'];
  if (expire) {
    expire = parseInt(expire);
  } else if (cacheHeaders.expires) {
    expire = (cacheHeaders.expires.getTime() - (new Date()).getTime()) / 1000;
  } else {
    expire = DEF_EXPIRE;
  }
  return Math.min(MAX_EXPIRE, expire);
}

var CacheEntry = function(entry) {
  this.statusCode = entry.statusCode || 500;
  this.headers = entry.headers || {};
  this.cacheControl = entry.cacheControl || {};
  this.data = entry.data || new Buffer();
  this.size = entry.size || this.data.length;

  if (Buffer.isBuffer(this.statusCode)) {
    this.statusCode = parseInt(this.statusCode);
  }
  if (Buffer.isBuffer(this.headers)) {
    this.headers = this.headers.toJSON();
  }
  if (Buffer.isBuffer(this.cacheControl)) {
    this.cacheControl = this.cacheControl.toJSON();
  }
  if (Buffer.isBuffer(this.size)) {
    this.size = parseInt(this.size);
  }
};

exports.handleRequest = function(request, response, options, callback) {
  if (request.method !== 'GET') {
    // Do nothing for POST and CONNECT requests or when caching is disabled.
    callback(null, false);
  }

  emitter.signal('start', 'load');

  var key = [request.headers.host, request.path];
  cache.load(key, function(error, cached) {
    if (!error && cached) {
      var entry = new CacheEntry(cached);
      request.debug('delivering %d bytes from cache', entry.size);
      response.writeHead(entry.statusCode, '', entry.headers);
      response.end(entry.data);
    }
    emitter.signal('end', 'load');
    callback(error, Boolean(cached));
  });
};

// Aggregates data and caches it when appropriate.
exports.handleResponse = function(request, source, dest) {
  emitter.signal('start', 'save');

  var statusCode = source.statusCode;
  var headers = source.headers;
  var cacheControl = parseCacheControl(headers);

  if (request.method !== 'GET' ||
      cacheControl['private'] || cacheControl['no-store']) {
    // Do nothing for POST and CONNECT requests or when caching is disabled.
    source.pipe(dest);
    source.resume();
    return;
  }

  // Expire time in seconds.
  var expire = maxAge(cacheControl);
  var data = [];

  source.on('data', function(chunk) {
    data.push(chunk);
    dest.write(chunk);
  });

  source.on('end', function() {
    if (expire > 0) {
      // Cache data.
      data = Buffer.concat(data);
      var entry = new CacheEntry({
        statusCode: statusCode,
        headers: headers,
        cacheControl: cacheControl,
        data: data,
        size: data.length
      });
      var key = [request.headers.host, request.path];
      cache.save(key, entry, expire);
      request.debug('cached %d bytes for %d s', entry.size, expire);
    }

    dest.end();
    emitter.signal('end', 'save');
  });

  source.resume();
};
