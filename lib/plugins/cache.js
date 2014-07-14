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
  if (request.method !== 'GET') {
    // Do nothing for POST and CONNECT requests or when caching is disabled.
    callback(null, false);
  }

  emitter.signal('start', 'load');

  var key = [request.headers.host, request.path];
  cache.load(key, function(error, cached) {
    if (!error && cached) {
      emitter.signal('count', 'hit');
      var entry = unserialize(cached);
      request.debug('delivering %d bytes from cache', entry.size);
      response.writeHead(entry.statusCode, '', entry.headers);
      response.end(entry.data);

      emitter.signal('count', 'transfer', entry.size);
    } else {
      emitter.signal('count', 'miss');
    }

    emitter.signal('end', 'load');
    callback(error, Boolean(cached));
  });
};

// Aggregates data and caches it when appropriate.
exports.handleResponse = function(request, source, dest) {
  emitter.signal('start', 'save');

  var entry = {
    statusCode: source.statusCode,
    headers: source.headers,
    cacheControl: parseCacheControl(source.headers),
    data: [],
    size: 0
  };

  // Expire time in seconds.
  var expire = maxAge(entry.cacheControl);

  if (request.method !== 'GET' ||
      entry.cacheControl['private'] ||
      entry.cacheControl['no-store'] ||
      expire <= 0) {
    emitter.signal('count', 'no-save');
    emitter.signal('end', 'save');

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

    emitter.signal('end', 'save');
  });

  source.on('close', function() {
    emitter.signal('end', 'save');
    request.warn('unexpected close in ' + NAME);
  });

  source.on('error', function(e) {
    emitter.signal('end', 'save');
    request.error(NAME + ' error: ' + e.message);
  });

  source.resume();
};
