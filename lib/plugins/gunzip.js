'use strict';

var zlib = require('zlib');

var util = require('./util');

var NAME = exports.name = 'gunzip';

var metrics = require('../metrics').session(NAME);

// Gunzip the stream, if necessary.
exports.handleResponse = function(request, source, dest) {
  if (util.matchHeaders(source.headers, { 'content-encoding': /gzip/ })) {
    metrics.count('hit');

    request.debug('uncompressing with gunzip');
    delete source.headers['content-encoding'];

    dest.writeHead(source.statusCode, source.headers);
    source.pipe(zlib.createGunzip()).pipe(dest);
  } else {
    // Do nothing.
    metrics.count('miss');
    source.forward(dest);
  }

  source.resume();
};
