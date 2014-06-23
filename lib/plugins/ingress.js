'use strict';

var NAME = exports.name = 'ingress';

var emitter = require('../emit').get(NAME);

// Simply passes the response through unmodified
exports.handleResponse = function(request, source, dest) {
  emitter.signal('start');

  request.debug('headers: ', source.headers);
  var count = 0;
  source.on('data', function(b) {
    count += b.length;
    dest.write(b);
  });

  source.on('end', function() {
    request.debug('ingress %d bytes', count);
    dest.end();
    emitter.signal('end');
  });

  source.on('error', function(err) {
    request.error(err);
    dest.statusCode = 500;
    dest.end();
    emitter.signal('end');
  });

  source.resume();
};
