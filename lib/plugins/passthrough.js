
// Simply passes the response through unmodified
exports.handleResponse = function(request, source, dest) {
  var count = 0;
  source.on('data', function(b) {
    count += b.length;
    dest.write(b);
  });

  source.on('end', function() {
    request.log('passthrough read %d bytes', count);
    dest.end();
  });

  source.resume();
};
