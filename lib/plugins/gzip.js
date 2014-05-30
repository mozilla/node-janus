var pluginUtil = require('./pluginUtil');
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
  if (pluginUtil.matchHeaders(request.headers, { 'accept-encoding': /gzip/ }) &&
      pluginUtil.matchHeaders(source.headers, {
        'content-type': /(text\/|\/json)/,
        'content-encoding': false
      }))
  {
    request.log("compressing with gzip");
    dest.headers['content-encoding'] = 'gzip';
    source.pipe(zlib.createGzip({ options: options.gzipLevel })).pipe(dest);
  } else {
    request.log("not compressing");
    // Do nothing
    source.pipe(dest);
  }

  source.resume();
}