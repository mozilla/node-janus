'use strict';

var NAME = exports.name = 'egress';

var emitter = require('../emit').get(NAME);

exports.handleResponse = function(request, source, dest) {
  emitter.signal('start');

  dest.writeHead(source.statusCode, source.headers);

  var length = 0;
  source.on('data', function(b) {
    length += b.length;
    dest.write(b);
  });

  source.on('end', function() {
    request.debug('egress (streaming) %d bytes', length);

    dest.end();

    emitter.signal('count', 'transfer', length);
    emitter.signal('end');
  });

  source.on('close', function() {
    dest.end();
    emitter.signal('end');
    request.warn('unexpected close in ' + NAME);
  });

  source.on('error', function(e) {
    dest.end();
    emitter.signal('end');
    request.error(NAME + ' error: ' + e.message);
  });

  source.resume();
};
