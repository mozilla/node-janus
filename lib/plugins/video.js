'use strict';

var spawn = require('child_process').spawn;
var exec = require('child_process').exec;

var CONFIG = require('config');
var log = require('../log');

var NAME = exports.name = 'video';

var metrics = require('../metrics').session(NAME);

var haveH264 = false;
exec('ffmpeg -formats', function(error, stdout) {
  haveH264 = !error && stdout.indexOf('h264') >= 0;
  log.info('Have H264 support? ', haveH264);
});

exports.handleResponse = function(request, source, dest) {
  if (haveH264 && source.headers['content-type'] === 'video/mp4') {
    metrics.count('hit');

    request.debug('converting mp4 video, quality level ' +
      CONFIG.video.quality);

    // We're changing the content-length
    delete source.headers['content-length'];

    var ffmpeg = spawn('ffmpeg', ['-loglevel', 'fatal', '-i', 'pipe:0', '-crf',
      CONFIG.video.quality, '-profile:v', 'high', '-f', 'ismv', 'pipe:1']);

    var wroteHead = false;
    ffmpeg.stdout.on('data', function(buf) {
      if (!wroteHead) {
        dest.writeHead(source.statusCode, source.headers);
        wroteHead = true;
      }

      dest.write(buf);
    });

    ffmpeg.stdout.on('end', function() {
      if (wroteHead) {
        dest.end();
      }
    });

    var errorHandler = function errorHandler(err) {
      if (!ffmpeg) {
        return;
      }

      if (!wroteHead) {
        dest.writeHead(500, 'Transcoder error', {});
        dest.end();
      }

      request.error('video transcode failed: ', err);
      ffmpeg.kill();
      ffmpeg = null;
    };

    ffmpeg.stdin.on('error', errorHandler);
    ffmpeg.stdout.on('error', errorHandler);
    ffmpeg.stderr.on('error', errorHandler);
    ffmpeg.once('error', errorHandler);

    source.pipe(ffmpeg.stdin);
  } else {
    source.forward(dest);
  }

  source.resume();
};
