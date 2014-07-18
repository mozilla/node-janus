'use strict';

var CONFIG = require('config');

var zlib = require('zlib');

var util = require('./util');

var NAME = exports.name = 'gzip';

var metrics = require('../metrics').session(NAME);

// Add gzip compression for text/* if the agent accepts it.
exports.handleResponse = function(request, source, dest) {
  var headerMatch = {
    'content-type': /(text\/|\/json|\/javascript|\/x-javascript)/,
    'content-encoding': false
  };

  if (util.matchHeaders(source.headers, headerMatch)) {
    metrics.count('hit');

    // We are writing gzip content.
    source.headers['content-encoding'] = 'gzip';

    // We do not know the length.
    delete source.headers['content-length'];

    dest.writeHead(source.statusCode, source.headers);
    source.pipe(zlib.createGzip({ options: CONFIG.gzip.level })).pipe(dest);
  } else {
    // Do nothing.
    metrics.count('miss');
    source.forward(dest);
  }

  source.resume();
};
