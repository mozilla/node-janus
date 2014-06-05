var util = require('./util');
var zlib = require('zlib');

exports.name = 'gzip';

// Adds gzip compression for text/* if the agent accepts it
exports.handleResponse = function(request, source, dest, options) {
  if (util.matchHeaders(request.headers, { 'accept-encoding': /gzip/ }) &&
      util.matchHeaders(source.headers,
        { 'content-type': /(text\/|\/json)/, 'content-encoding': false })) {
    request.log('compressing with gzip');
    dest.headers['content-encoding'] = 'gzip';

    dest.accumulate = true;
    dest.contentLengthChange = true;
    source.pipe(zlib.createGzip({ options: options.gzip.level })).pipe(dest);
  } else {
    // Do nothing
    source.pipe(dest);
  }

  source.resume();
};
