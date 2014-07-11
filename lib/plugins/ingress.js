'use strict';

var NAME = exports.name = 'ingress';

var emitter = require('../emit').get(NAME);

// Simply passes the response through unmodified
exports.handleResponse = function(request, source, dest) {
  emitter.signal('start');

  // Here, 'source' is a http.IncomingMessage, not a PipedResponse. As such,
  // we don't need to wait on the 'head' event (since there won't be one).
  // The headers are available to use immediately.

  if (source.headers['content-length']) {
    source.headers['x-original-content-length'] = source.headers['content-length'];
  }

  dest.writeHead(source.statusCode, source.headers);

  var count = 0;
  source.on('data', function(b) {
    count += b.length;
    dest.write(b);
  });

  source.on('end', function() {
    request.debug('ingress %d bytes', count);

    dest.end();

    emitter.signal('count', 'transfer', count);
    emitter.signal('end');
  });

  source.on('error', function(err) {
    request.error(err);
    dest.writeHead(500);
    dest.end();
    emitter.signal('end');
  });

  source.resume();
};
