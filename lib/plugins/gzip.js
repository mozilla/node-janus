var zlib = require('zlib');


exports.options = {
  gzipLevel: {
    alias: 'l',
    description: 'Compression level for gzip',
    default: 9
  }
};

// Adds gzip compression for text/* if the agent accepts it
exports.handleResponse = function(request, source, dest, options) {
  if (request.headers['accept-encoding'] &&
      request.headers['accept-encoding'].indexOf('gzip') >= 0 &&
      !source.headers['content-encoding']) {

    dest.headers['content-encoding'] = 'gzip';
    source.pipe(zlib.createGzip({ options: options.gzipLevel })).pipe(dest);
  } else {
    // Do nothing
    source.pipe(dest);
  }

  source.resume();
}