'use strict';

exports.name = 'egress';

// Simply accumulates the data and writes the final result to dest. Here
// 'dest' should be the actual http response
exports.handleResponse = function(request, source, dest) {
  if (source.accumulate) {
    var bufs = [];
    source.on('data', function(b) {
      bufs.push(b);
    });

    source.on('end', function() {
      var finalBuffer = Buffer.concat(bufs);

      request.log('egress (accumulated) %d bytes', finalBuffer.length);

      dest.statusCode = source.statusCode;
      dest.headers = source.headers;
      dest.headers['content-length'] = finalBuffer.length;

      dest.writeHead(source.statusCode, '', source.headers);
      dest.write(finalBuffer, function() {
        dest.end();
      });
    });
  } else {
    if (source.contentLengthChange) {
      // The length changed, so we have to clear that header
      // since it's now incorrect.
      delete source.headers['content-length'];
    }

    dest.writeHead(source.statusCode, source.headers);

    var count = 0;
    source.on('data', function(b) {
      count += b.length;
      dest.write(b);
    });

    source.on('end', function() {
      request.log('egress (streaming) %d bytes', count);
      dest.end();
    });
  }

  source.resume();
};
