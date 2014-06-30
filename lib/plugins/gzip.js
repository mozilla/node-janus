'use strict';

var CONFIG = require('config');

var zlib = require('zlib');

var util = require('./util');

var NAME = exports.name = 'gzip';

var emitter = require('../emit').get(NAME);

// Adds gzip compression for text/* if the agent accepts it
exports.handleResponse = function(request, source, dest) {
  if (util.matchHeaders(request.headers, { 'accept-encoding': /gzip/ }) &&
      util.matchHeaders(source.headers,
        { 'content-type': /(text\/|\/json)/, 'content-encoding': false })) {
    emitter.signal('count', 'hit');
    emitter.signal('start');

    // We are writing gzip content
    source.headers['content-encoding'] = 'gzip';

    // We do not know the length
    delete source.headers['content-length'];

    dest.writeHead(source.statusCode, source.headers);
    source.pipe(zlib.createGzip({ options: CONFIG.gzip.level })).pipe(dest);
    dest.on('finish', function() {
      emitter.signal('end');
    });
  } else {
    // Do nothing
    emitter.signal('count', 'miss');
    source.forward(dest);
  }

  source.resume();
};
