'use strict';

var http2 = require('http2');
var cheerio = require('cheerio');

var helper = require('../helper/testHelper');

require('chai').should();

module.exports = {
  'gif2video': {
    'gif -> webm': {
      before: function(done) {
        helper.loadProxy();
        helper.setupLocalServer('test/helper/content/gif2video/', done);
      },

      after: function() {
        helper.cleanAll();
      },

      testConversion: function(done) {
        // The conversion can take a while.
        this.timeout(30000);

        var filename = 'simple.html';
        var req = helper.makeRequest(helper.getLocalUrl(filename),
          '-gzip -gif2video');

        helper.getContent(req, function(res) {
          var doc = cheerio.load(res);

          // Verify we have a page with a GIF and no videos
          doc('#thegif').length.should.equal(1);
          doc('#thegif').is('img').should.equal(true);
          doc('video').length.should.equal(0);
          doc('img').length.should.equal(1);

          req = helper.makeRequest(helper.getLocalUrl(filename),
            '-gzip +gif2video');

          helper.getContent(req, function(res) {
            doc = cheerio.load(res);

            // Verify the GIF is now a video element
            doc('#thegif').length.should.equal(1);
            doc('#thegif').is('video').should.equal(true);
            doc('video').length.should.equal(1);
            doc('img').length.should.equal(0);

            var videoSrc = doc('#thegif').attr('src');
            videoSrc.indexOf('.webm').should.be.above(0);

            // Verify we can request the WebM
            req = helper.makeRequest(videoSrc, '+gif2video');
            http2.get(req, function(res) {
              res.headers['content-type'].should.equal('video/webm');

              helper.readResponse(res, function(err, buf) {
                parseInt(res.headers['content-length']).
                  should.equal(buf.length);

                // TODO(snorp): verify the data is WebM
                // (or whatever is advertised)
                done();
              });
            });
          });
        });
      }
    },
  },
};
