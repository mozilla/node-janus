
// Simply passes the response through unmodified
exports.handleResponse = function(request, source, dest) {
  var count = 0;
	source.on('data', function(b) {
    count += b.length;
    dest.write(b);
	});

  source.on('end', function() {
    console.log('%s\tpassthrough read %d bytes',
        new Date().toISOString().time,
        count);
    dest.end();
  });

  source.resume();
}