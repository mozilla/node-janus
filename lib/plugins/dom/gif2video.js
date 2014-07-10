'use strict';

var Url = require('url');
var fs = require('fs');
var temp = require('temp');
var util = require('util');
var spawn = require('child_process').spawn;

temp.track();

var pendingIntercepts = {};

function transcodeGif(source, callback) {
  var gifPath = temp.path({ suffix: '.gif' });

  var gifStream = fs.createWriteStream(gifPath);
  source.pipe(gifStream).on('finish', function() {
    var destPath = temp.path({ suffix: '.webm' });
    var ffmpeg = spawn('ffmpeg',
        ['-i', gifPath, '-vcodec', 'libvpx', destPath]);
    ffmpeg.on('close', function(code) {
      if (code !== 0) {
        callback('Failed, exit code ' + code);
        return;
      }

      fs.stat(destPath, function(err, stats) {
        if (err) {
          callback(err);
          return;
        }

        var videoSource = fs.createReadStream(destPath);
        videoSource.pause();

        videoSource.on('end', function() {
          fs.unlink(destPath);
        });

        callback(null, videoSource, stats.size);
      });
    });
  });
}

exports.name = 'gif2video';

// Intercept GIF requests and serve transcoded to webm
exports.handleRequest = function(request, response, options, callback) {
  var gifUrl = pendingIntercepts[request.originalUrl];
  if (gifUrl) {
    // Replace the url with the intercepted version
    request._webmUrl = request.originalUrl;
    request.url = request.originalUrl = gifUrl;

    request.path = Url.parse(gifUrl).path;
  }

  callback(null, false);
};

// Replace <img src="foo.gif"> with <video autoplay loop src="foo.gif">
exports.handleDOMResponse = function(request, source, $, callback) {
  $('img').each(function(i, el) {
    var src = $(el).attr('src');
    if (src && src.match(/\.gif$/i)) {
      var gifSrc = Url.resolve(request.url, src);
      var webmSrc = gifSrc.replace(/\.gif$/i, '.webm');

      pendingIntercepts[webmSrc] = gifSrc;
      var newEl = $(util.format('<video autoplay loop src="%s"></video>',
        webmSrc));

      // Copy some attribute values to the new video element
      ['id', 'class', 'style'].forEach(function(attr) {
        var val = $(el).attr(attr);
        if (val) {
          newEl.attr(attr, val);
        }
      });

      $(el).replaceWith(newEl);
    }
  });

  callback();
};

exports.handleResponse = function(request, source, dest) {
  if (request._webmUrl) {
    request.debug('intercepting GIF for conversion to video');

    transcodeGif(source, function(err, videoStream, videoSize) {
      if (!err && videoStream) {
        source.headers['content-type'] = 'video/webm';
        source.headers['content-length'] = videoSize;

        dest.writeHead(source.statusCode, source.headers);
        videoStream.pipe(dest);
        videoStream.resume();
      } else {
        request.error('GIF transcode failed', err);

        // FIXME: put this somewhere common
        dest.writeHead(500, { 'content-type': 'text/plain' });
        dest.end('GIF transcode failed\n');
      }
    });
  } else {
    // Do nothing
    source.forward(dest);
  }

  source.resume();
};
