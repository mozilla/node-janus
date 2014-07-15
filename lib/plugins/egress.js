'use strict';

var NAME = exports.name = 'egress';

var emitter = require('../emit').get(NAME);

exports.handleResponse = function(request, source, dest) {
  dest.writeHead(source.statusCode, source.headers);

  var length = 0;
  source.on('data', function(b) {
    length += b.length;
    dest.write(b);
  });

  source.on('end', function() {
    dest.end();

    request.debug('egress (streaming) %d bytes', length);
    emitter.signal('count', 'transfer', length);
  });

  source.on('close', function() {
    dest.end();
  });

  source.on('error', function() {
    dest.end();
  });

  source.resume();
};
