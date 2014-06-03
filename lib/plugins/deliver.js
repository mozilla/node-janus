
// Simply accumulates the data and writes the final result to dest. Here
// 'dest' should be the actual http response
exports.handleResponse = function(request, source, dest) {
  var bufs = [];
  source.on('data', function(b) {
    bufs.push(b);
  });

  source.on('end', function() {
    var finalBuffer = Buffer.concat(bufs);

    request.log('delivering %d bytes', finalBuffer.length);

    dest.statusCode = source.statusCode;
    dest.headers = source.headers;
    dest.headers['content-length'] = finalBuffer.length;

    dest.writeHead(source.statusCode, '', source.headers);
    dest.write(finalBuffer);
    dest.end();
  });

  source.resume();
};
