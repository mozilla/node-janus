var url = require('url');
var cache = require('../cache');

exports.load = function(request, dest, options, callback) {
  if (!options.cache.use || request.method !== 'GET') {
    // Do nothing for POST and CONNECT requests or when caching is disabled.
    callback(null, false);
  }

  var path = request.headers.path || url.parse(request.url).path;
  var key = [request.headers.host, path];
  cache.load(key, function(error, cached) {
    if (!error && cached) {
      var value = cached.value;
      request.log('delivering %d bytes from cache', cached.size);
      dest.writeHead(value[0][0], value[0][1], value[0][2]);
      // TODO(esawin): fix explicit buffer creation workaround for redis.
      dest.end(new Buffer(value[1]));
    }
    callback(error, Boolean(cached));
  });
};
