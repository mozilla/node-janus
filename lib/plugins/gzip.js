'use strict';

var CONFIG = require('config');

var zlib = require('zlib');

var util = require('./util');

var NAME = exports.name = 'gzip';

var emitter = require('../emit').get(NAME);

// Add gzip compression for text/* if the agent accepts it.
exports.handleResponse = function(request, source, dest) {
  var headerMatch = {
    'content-type': /(text\/|\/json|\/javascript|\/x-javascript)/,
    'content-encoding': false
  };

  if (util.matchHeaders(source.headers, headerMatch)) {
    emitter.signal('count', 'hit');
    emitter.signal('start');

    // We are writing gzip content.
    source.headers['content-encoding'] = 'gzip';

    // We do not know the length.
    delete source.headers['content-length'];

    dest.writeHead(source.statusCode, source.headers);
    source.pipe(zlib.createGzip({ options: CONFIG.gzip.level })).pipe(dest);

    dest.on('finish', function() {
      emitter.signal('end');
    });

    source.on('close', function() {
      emitter.signal('end');
      request.warn('unexpected close in ' + NAME);
    });

    source.on('error', function(e) {
      emitter.signal('end');
      request.error(NAME + ' error: ' + e.message);
    });
  } else {
    // Do nothing.
    emitter.signal('count', 'miss');
    source.forward(dest);
  }

  source.resume();
};
