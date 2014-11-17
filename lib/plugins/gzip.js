'use strict';

var zlib = require('zlib');

var util = require('./util');

var NAME = exports.name = 'gzip';
var metrics = require('../metrics').session(NAME);

var HEADER_MATCH = {
  'content-type': /(text\/|\/json|\/javascript|\/x-javascript)/,
  'content-encoding': false
};

var GZIP_OPTIONS = {
  options: {
    level: zlib.Z_BEST_COMPRESSION,
    windowBits: 16,
    memLevel: 9,
    chunkSize: 32 * 1024
  }
};

function shouldCompress(source) {
  var isSupportedType = util.matchHeaders(source.headers, HEADER_MATCH);
  return isSupportedType;
}

// Add gzip compression for text/* if the agent accepts it.
exports.handleResponse = function(request, source, dest) {
  if (shouldCompress(source)) {
    metrics.count('hit');

    // We are writing gzip content.
    source.headers['content-encoding'] = 'gzip';

    // We do not know the length.
    delete source.headers['content-length'];

    dest.writeHead(source.statusCode, source.headers);
    source.pipe(zlib.createGzip(GZIP_OPTIONS)).pipe(dest);
  } else {
    // Do nothing.
    metrics.count('miss');
    source.forward(dest);
  }

  source.resume();
};
