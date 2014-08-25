'use strict';

var spawn = require('child_process').spawn;

var CONFIG = require('config');

var NAME = exports.name = 'video';

var metrics = require('../metrics').session(NAME);

exports.handleResponse = function(request, source, dest) {
  if (source.headers['content-type'] === 'video/mp4') {
    metrics.count('hit');

    request.debug('converting mp4 video, quality level ' +
      CONFIG.video.quality);

    // We're changing the content-length
    delete source.headers['content-length'];

    dest.writeHead(source.statusCode, source.headers);

    var ffmpeg = spawn('ffmpeg', ['-loglevel', 'fatal', '-i', 'pipe:0', '-crf',
      CONFIG.video.quality, '-profile:v', 'high', '-f', 'ismv', 'pipe:1']);

    ffmpeg.stdout.on('data', function(buf) {
      dest.write(buf);
    });

    ffmpeg.stdout.on('end', function() {
      dest.end();
    });

    ffmpeg.stderr.on('data', function(buf) {
      request.error('video error: ', buf.toString());
    });

    source.pipe(ffmpeg.stdin);
  } else {
    source.forward(dest);
  }

  source.resume();
};
