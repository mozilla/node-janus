'use strict';

var NAME = exports.name = 'fork';

var emitter = require('../emit').get(NAME);

// 'Fork' the source stream into the next and dest streams.
exports.handleResponse = function(request, source, next, options, dest) {
  emitter.signal('count', 'hit');

  dest.writeHead(source.statusCode, source.headers);
  source.pipe(dest);

  next.writeHead(source.statusCode, source.headers);
  source.pipe(next);
};

// Plugin writes directly to the destination stream.
exports.isShortcut = true;
