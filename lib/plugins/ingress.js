'use strict';

var CONFIG = require('config');

var NAME = exports.name = 'ingress';

var emitter = require('../emit').get(NAME);

// Simply passes the response through unmodified.
exports.handleResponse = function(request, source, dest) {
  // Here, 'source' is a http.IncomingMessage, not a PipedResponse. As such,
  // we don't need to wait on the 'head' event (since there won't be one).
  // The headers are available to use immediately.

  var accumulate = false;
  if (source.headers['content-length']) {
    source.headers['x-original-content-length'] =
      source.headers['content-length'];
  } else if (CONFIG.ingress.accumulateUnknownLengths) {
    accumulate = true;
  }

  if (!accumulate) {
    dest.writeHead(source.statusCode, source.headers);
  }

  var length = 0;
  var bufs = [];
  source.on('data', function(b) {
    length += b.length;

    if (accumulate) {
      bufs.push(b);
    } else {
      dest.write(b);
    }
  });

  source.on('end', function() {
    if (accumulate) {
      var data = Buffer.concat(bufs, length);

      // We can set the content-length headers now.
      source.headers['x-original-content-length'] =
        source.headers['content-length'] = length;

      request.debug('ingress (accumulated) %d bytes', length);

      dest.writeHead(source.statusCode, source.headers);
      dest.end(data);
    } else {
      request.debug('ingress (streamed) %d bytes', length);

      dest.end();
    }

    emitter.signal('count', 'transfer', length);
  });

  source.on('error', function() {
    dest.writeHead(500);
    dest.end();
  });

  source.resume();
};
