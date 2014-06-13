'use strict';

var zlib = require('zlib');

var util = require('./util');

var NAME = exports.name = 'gzip';

var emitter = require('../emit').get(NAME);

// Adds gzip compression for text/* if the agent accepts it
exports.handleResponse = function(request, source, dest, options) {
  if (util.matchHeaders(request.headers, { 'accept-encoding': /gzip/ }) &&
      util.matchHeaders(source.headers,
        { 'content-type': /(text\/|\/json)/, 'content-encoding': false })) {
    emitter.signal('count', 'hit');
    request.log('compressing with gzip');
    dest.headers['content-encoding'] = 'gzip';

    dest.accumulate = true;
    dest.contentLengthChange = true;
    source.pipe(zlib.createGzip({ options: options.gzip.level })).pipe(dest);
  } else {
    // Do nothing
    emitter.signal('count', 'miss');
    source.pipe(dest);
  }

  source.resume();
};
