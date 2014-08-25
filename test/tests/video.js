'use strict';

var http = require('http');
var util = require('../../lib/util');
var fs = require('fs');

var helper = require('../helper/testHelper');
var DummyResponse = require('../helper/dummyResponse');
var DummyRequest = require('../helper/dummyRequest');

var videoPlugin = require('../../lib/plugins/video.js');

var baseSize = 0;
var compressedSize = 0;

var VIDEOS_DIR = 'test/helper/content/videos/';

require('chai').should();

function testVideoSize(url, done) {
  http.get(url, function(source) {
    var baseLength = parseInt(source.headers['content-length']);

    source.resume = function() {};
    source.forward = function(dest) {
      dest.writeHead(source.statusCode, source.headers);
      source.pipe(dest);
    };

    var dest = new DummyResponse();
    var compressedLength = 0;
    dest.on('data', function(buf) {
      compressedLength += buf.length;
    });
    dest.on('end', function() {
      compressedSize += compressedLength;
      baseSize += baseLength;
      compressedLength.should.be.at.most(baseLength);
      done();
    });

    videoPlugin.handleResponse(new DummyRequest(url), source, dest);
  });
}

module.exports = {
  'video': {
    'sizes': {
      before: function(done) {
        helper.setupLocalServer(VIDEOS_DIR, done);
      },

      after: function() {
        console.log('\n\n\tTotal video compression: %d% (%dKB -> %dKB).',
                    (100 - (compressedSize * 100) / baseSize).toFixed(2),
                    Math.round(util.byteToKb(baseSize)),
                    Math.round(util.byteToKb(compressedSize)));
        helper.cleanAll();
      },
    },
  },
};

var images = fs.readdirSync(VIDEOS_DIR);
images.forEach(function(vid) {
  module.exports.video.sizes[vid] = function(done) {
    this.timeout(30000);

    testVideoSize(helper.getLocalUrl(vid), done);
  };
});
