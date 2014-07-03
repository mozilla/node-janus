'use strict';

var NAME = exports.name = 'egress';

var emitter = require('../emit').get(NAME);

exports.handleResponse = function(request, source, dest) {

  emitter.signal('start');
  dest.writeHead(source.statusCode, source.headers);

  var count = 0;
  source.on('data', function(b) {
    count += b.length;
    dest.write(b);
  });

  source.on('end', function() {
    request.debug('egress (streaming) %d bytes', count);

    dest.end();

    emitter.signal('count', 'transfer', count);
    emitter.signal('end');
  });

  source.resume();
};
