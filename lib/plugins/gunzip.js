'use strict';

var zlib = require('zlib');

var util = require('./util');

var NAME = exports.name = 'gunzip';

var emitter = require('../emit').get(NAME);

// Gunzip the stream, if necessary.
exports.handleResponse = function(request, source, dest) {
  if (util.matchHeaders(source.headers, { 'content-encoding': /gzip/ })) {
    emitter.signal('count', 'hit');
    emitter.signal('start');

    request.debug('uncompressing with gunzip');
    delete source.headers['content-encoding'];

    dest.writeHead(source.statusCode, source.headers);
    source.pipe(zlib.createGunzip()).pipe(dest);

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
