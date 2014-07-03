'use strict';

var http = require('http');
var util = require('../../lib/util');
var fs = require('fs');

var helper = require('../helper/testHelper');
var DummyResponse = require('../helper/dummyResponse');
var DummyRequest = require('../helper/dummyRequest');

var imgcompression = require('../../lib/plugins/imgcompression.js');

var baseSize = 0;
var compressedSize = 0;

require('chai').should();

function testImageSize(url, done) {
  http.get(url, function(source) {
    var baseLength = parseInt(source.headers['content-length']);

    source.resume = function() {};

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

    imgcompression.handleResponse(new DummyRequest(url), source, dest);
  });
}

module.exports = {
  'imgcompression': {
    'sizes': {
      before: function(done) {
        helper.setupLocalServer('test/helper/content/imgs/', done);
      },

      after: function() {
        console.log('\n\n\tTotal image compression: %d% (%dKB -> %dKB).',
                    (100 - (compressedSize * 100) / baseSize).toFixed(2),
                    Math.round(util.byteToKb(baseSize)),
                    Math.round(util.byteToKb(compressedSize)));
        helper.cleanAll();
      },
    },
  },
};

var images = fs.readdirSync('test/helper/content/imgs/');
images.forEach(function(img) {
  module.exports.imgcompression.sizes[img] = function(done) {
    testImageSize(helper.getLocalUrl(img), done);
  };
});
