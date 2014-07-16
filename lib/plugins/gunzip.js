'use strict';

var zlib = require('zlib');

var util = require('./util');

var NAME = exports.name = 'gunzip';

var emitter = require('../emit').get(NAME);

// Gunzip the stream, if necessary.
exports.handleResponse = function(request, source, dest) {
  if (util.matchHeaders(source.headers, { 'content-encoding': /gzip/ })) {
    emitter.signal('count', 'hit');

    request.debug('uncompressing with gunzip');
    delete source.headers['content-encoding'];

    dest.writeHead(source.statusCode, source.headers);
    source.pipe(zlib.createGunzip()).pipe(dest);
  } else {
    // Do nothing.
    emitter.signal('count', 'miss');
    source.forward(dest);
  }

  source.resume();
};
