'use strict';

exports.name = 'ingress';

// Simply passes the response through unmodified
exports.handleResponse = function(request, source, dest) {
  request.log('headers: ', source.headers);
  var count = 0;
  source.on('data', function(b) {
    count += b.length;
    dest.write(b);
  });

  source.on('end', function() {
    request.log('ingress %d bytes', count);
    dest.end();
  });

  source.on('error', function(err) {
    request.log('error', err);
    dest.statusCode = 500;
    dest.end();
  });

  source.resume();
};
