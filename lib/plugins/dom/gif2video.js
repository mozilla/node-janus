var Url = require('url');
var fs = require('fs');
var temp = require('temp');
var util = require('util');
var spawn = require('child_process').spawn;

var pendingIntercepts = {};

temp.track();

function transcodeGIF(source, callback) {
  var gifPath = temp.path({ suffix: '.gif' });
  var gifStream = fs.createWriteStream(gifPath);

  source.pipe(gifStream);
  gifStream.on('finish', function() {
    var destPath = temp.path({ suffix: '.webm' });
    var ffmpeg = spawn('ffmpeg',
        ['-i', gifPath, '-vcodec', 'libvpx', destPath]);
    ffmpeg.on('close', function(code) {
      if (code !== 0) {
        callback('Failed, exit code ' + code);
        return;
      }

      var videoSource = fs.createReadStream(destPath);

      var bufs = [];
      videoSource.on('data', function(b) {
        bufs.push(b);
      });
      videoSource.on('end', function() {
        callback(null, Buffer.concat(bufs));
      });
    });
  });
}

exports.name = 'gif2video';

// Intercept GIF requests and serve transcoded to webm
exports.handleRequest = function(request) {
  var gifUrl = pendingIntercepts[request.url];
  if (gifUrl) {
    request.log('replacing %s with %s', request.url, gifUrl);

    // Replace the url with the intercepted version
    request.originalUrl = request.url;
    request.url = gifUrl;
  }
};

// Replace <img src="foo.gif"> with <video autoplay loop src="foo.gif">
exports.handleDOMResponse = function(request, source, $, callback) {
  $('img').each(function(i, el) {
    var src = $(el).attr('src');
    if (src && src.match(/\.gif$/i)) {
      var gifSrc = Url.resolve(request.url, src);
      var webmSrc = gifSrc.replace(/\.gif$/i, '.webm');

      request.log('adding to gif intercept list: ' + gifSrc);

      pendingIntercepts[webmSrc] = gifSrc;
      $(el).replaceWith(
        util.format('<video autoplay loop src="%s"></video>', webmSrc));
    }
  });

  callback();
};

exports.handleResponse = function(request, source, dest) {
  if (pendingIntercepts[request.originalUrl]) {
    request.log('intercepting GIF for conversion to video');

    dest.contentLengthChange = true;
    dest.accumulate = false;
    dest.headers['content-type'] = 'video/webm';

    transcodeGIF(source, function(err, buffer) {
      if (!err) {
        request.log('writing transcoded gif');
        delete pendingIntercepts[request.url];

        dest.write(buffer, function() {
          dest.end();
        });
      } else {
        request.log('gif transcode failed', err);
        dest.statusCode = 500;
        dest.end();
      }
    });
  } else {
    // Do nothing
    source.pipe(dest);
  }

  source.resume();
};
