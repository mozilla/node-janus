'use strict';

var CONFIG = require('config');

var NAME = exports.name = 'ingress';

var emitter = require('../emit').get(NAME);

// Simply passes the response through unmodified
exports.handleResponse = function(request, source, dest) {
  emitter.signal('start');

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

  var count = 0;
  var bufs = [];
  source.on('data', function(b) {
    if (accumulate) {
      bufs.push(b);
    } else {
      count += b.length;
      dest.write(b);
    }
  });

  source.on('end', function() {
    if (accumulate) {
      var data = Buffer.concat(bufs);

      // We can set the content-length headers now
      source.headers['x-original-content-length'] =
        source.headers['content-length'] = count = data.length;

      request.debug('ingress (accumulated) %d bytes', data.length);

      dest.writeHead(source.statusCode, source.headers);
      dest.end(data);
    } else {
      request.debug('ingress (streamed) %d bytes', count);

      dest.end();
    }

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
