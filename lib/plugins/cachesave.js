var url = require('url');
var cache = require('../cache');

var MAX_EXPIRE = 7 * 24 * 60 * 60;
// var DEF_EXPIRE = 1 * 24 * 60 * 60;
var DEF_EXPIRE = 30;

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

// Aggregates data and caches it when appropriate.
exports.handleResponse = function(request, source, dest, options) {
  var cacheControl = parseCacheControl(source.headers);

  if (!options.cache.use || request.method !== 'GET' ||
      cacheControl['private'] || cacheControl['no-store']) {
    // Do nothing for POST and CONNECT requests or when caching is disabled.
    source.pipe(dest);
    source.resume();
    return;
  }

  // Expire time in seconds.
  var expire = maxAge(cacheControl);
  var count = 0;
  var data = [];

  source.on('data', function(chunk) {
    count += chunk.length;
    data.push(chunk);
    dest.write(chunk);
  });

  source.on('end', function() {
    if (expire > 0) {
      // Cache data.
      data = Buffer.concat(data);
      var path = request.headers.path || url.parse(request.url).path;
      var key = [request.headers.host, path];
      var header = [source.statusCode, '', source.headers];
      cache.save(key,
        { value: [header, data, cacheControl], size: data.length }, expire);
      request.log('cached %d bytes for %d s', count, expire);
    }

    dest.end();
  });

  source.resume();
};
