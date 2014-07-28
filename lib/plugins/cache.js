'use strict';

var CACHE_CONFIG = require('config').cache;

var cache = require('../cache');

var MAX_EXPIRE = CACHE_CONFIG.expire.max;
var DEF_EXPIRE = CACHE_CONFIG.expire.default;

var NAME = exports.name = 'cache';

var metrics = require('../metrics').session(NAME);

// Parses cache control header and last-modified.
function parseCacheControl(headers) {
  var cacheHeaders = {};

  var lastMod = headers['last-modified'];
  if (lastMod) {
    cacheHeaders['last-modified'] = new Date(lastMod);
  }

  cacheHeaders.date = headers.date ? new Date(headers.date) : new Date();
  cacheHeaders.age = headers.age;

  if (headers.expires) {
    cacheHeaders.expires = new Date(headers.expires);
  }

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

// Returns the maximum freshness age for the resource.
function maxAge(cacheHeaders) {
  // Max age can be set to 0 to disable caching.
  var expire = cacheHeaders['s-maxage'];
  if (typeof expire === 'undefined') {
    expire = cacheHeaders['max-age'];
  }

  if (typeof expire !== 'undefined') {
    expire = parseInt(expire);
  } else if (cacheHeaders.expires) {
    expire = (cacheHeaders.expires.getTime() -
              cacheHeaders.date.getTime()) / 1000;
  } else {
    expire = DEF_EXPIRE;
  }

  return Math.max(0, expire);
}

// Returns the conservative age of the resource.
function currentAge(cacheHeaders) {
  var age = ((new Date()).getTime() - cacheHeaders.date.getTime()) / 1000;

  // TODO(esawin): foreward request date needs to be considered here, too.
  age = Math.max(age, cacheHeaders.age || 0);

  return Math.max(0, age);
}

// Returns the expire time in seconds.
function expirationTime(cacheHeaders) {
  var expire = maxAge(cacheHeaders) - currentAge(cacheHeaders);

  return Math.max(0, Math.min(MAX_EXPIRE, expire));
}

function unserialize(entry) {
  var pack = {};
  pack.statusCode = parseInt(entry.statusCode);
  pack.size = parseInt(entry.size);
  pack.headers = JSON.parse(entry.headers);
  pack.cacheControl = JSON.parse(entry.cacheControl);
  pack.data = entry.data;
  return pack;
}

function serialize(entry) {
  var pack = {};
  pack.statusCode = entry.statusCode;
  pack.size = entry.size;
  pack.headers = JSON.stringify(entry.headers);
  pack.cacheControl = JSON.stringify(entry.cacheControl);
  pack.data = Buffer.concat(entry.data, entry.size);
  return pack;
}

exports.handleRequest = function(request, response, options, callback) {
  var cacheControl = parseCacheControl(request.headers);

  if (request.method !== 'GET' ||
      request.headers.authorization ||
      request.headers.range ||
      cacheControl['no-cache'] ||
      cacheControl['max-age'] === '0') {
    // Do nothing for POST and CONNECT requests or when caching is disabled by
    // the client.
    return callback(null, false);
  }

  var key = [request.headers.host, request.path];
  cache.load(key, function(error, cached) {
    var handled = false;

    if (!error && cached) {
      handled = true;

      var entry = unserialize(cached);
      request.debug('delivering %d bytes from cache', entry.size);
      response.writeHead(entry.statusCode, '', entry.headers);
      response.end(entry.data);

      metrics.count('hit');
      metrics.count('transfer', entry.size);
    } else {
      if (cacheControl['only-if-cached']) {
        handled = true;
        response.writeHead(504, '', 'Failed fetching only-if-cached resource');
        response.end();
      }

      metrics.count('miss');
    }

    callback(error, handled);
  });
};

// Return true if the given resource entry is cacheable, false otherwise.
function cacheable(request, entry) {
  var requestCacheControl = parseCacheControl(request.headers);

  if (request.method !== 'GET' ||
      request.headers.authorization ||
      request.headers.range ||
      requestCacheControl['no-store'] ||
      entry.headers['accept-ranges'] ||
      entry.headers['content-range'] ||
      entry.cacheControl['private'] ||
      entry.cacheControl['no-store']) {
    // Non-cacheable resource.
    return false;
  }
  if (entry.headers.vary) {
    var vary = entry.headers.vary.trim().split(',');
    if (vary.length > 0 &&
        (vary.length > 1 ||
         vary[0].trim() !== 'accept-encoding')) {
      // We only support accept-encoding vary directives.
      return false;
    }
  }
  return true;
}

// Aggregates data and caches it when appropriate.
exports.handleResponse = function(request, source, dest) {
  var entry = {
    statusCode: source.statusCode,
    headers: source.headers,
    cacheControl: parseCacheControl(source.headers),
    data: [],
    size: 0
  };

  // Expire time in seconds.
  var expire = expirationTime(entry.cacheControl);

  if (!cacheable(request, entry) || expire <= 0) {
    metrics.count('no-save');

    // Do nothing for POST and CONNECT requests or when caching is disabled.
    source.forward(dest);
    source.resume();
    return;
  }

  dest.writeHead(entry.statusCode, entry.headers);

  source.on('data', function(chunk) {
    entry.size += chunk.length;
    entry.data.push(chunk);
    dest.write(chunk);
  });

  source.on('end', function() {
    dest.end();

    // Cache data.
    var key = [request.headers.host, request.path];
    cache.save(key, serialize(entry), expire);

    request.debug('cached %d bytes for %d s', entry.size, expire);
  });

  source.resume();
};
