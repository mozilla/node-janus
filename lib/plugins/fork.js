'use strict';

var NAME = exports.name = 'fork';

var metrics = require('../metrics').session(NAME);

// 'Fork' the source stream into the next and dest streams.
exports.handleResponse = function(request, source, next, options, dest) {
  metrics.count('hit');

  dest.writeHead(source.statusCode, source.headers);
  source.pipe(dest);

  next.writeHead(source.statusCode, source.headers);
  source.pipe(next);
};

// Plugin writes directly to the destination stream.
exports.isShortcut = true;
