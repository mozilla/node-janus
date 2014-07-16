'use strict';

var http2 = require('http2');
var should = require('chai').should();
var cheerio = require('cheerio');

var helper = require('../helper/testHelper');

module.exports = {
  'global': {
    before: function(done) {
      helper.setupLocalServer('test/helper/content/', function() {
        helper.loadProxy();
        done();
      });
    },
    after: helper.cleanAll,
    'gzip': {

      'simple accept gzip': function(done) {
        var req = helper.makeRequest('http://localhost:8080/dummy.html',
                                     '+gzip');

        http2.get(req, function(res) {
          should.exist(res.headers['content-encoding']);
          res.headers['content-encoding']
             .should.equal('gzip');
          done();
        });
      },

    },

    'xz': {

      'simple accept xz': function(done) {
        var req = helper.makeRequest('http://localhost:8080/dummy.html',
                                     '+xz');
        req.headers['accept-encoding'] = 'gzip, deflate, xz';

        http2.get(req, function(res) {
          should.exist(res.headers['content-encoding']);
          res.headers['content-encoding']
             .should.equal('xz');
          done();
        });
      }
    },

    'status codes': {
      '200': function(done) {
        var req = helper.makeRequest(helper.localAddress, '+gzip');
        http2.get(req, function(res) {
          res.statusCode.should.equal(200);
          done();
        });
      },

      '404': function(done) {
        var req = helper.makeRequest(helper.getLocalUrl('doesntexist'),
                                     '+gzip');
        http2.get(req, function(res) {
          res.statusCode.should.equal(404);
          done();
        });
      },
    },

    'DOM': {
      'ISO to UTF8 conversion': function(done) {
        // add gif2video plugin to enable DOM parsing
        var req = helper.makeRequest(helper.getLocalUrl('iso8859.html'),
                                     '+gif2video -gzip');

        helper.getContent(req, function(content, statusCode, headers) {
          headers['content-type'].indexOf('UTF-8').should.not.equal(-1);

          var $ = cheerio.load(content);
          var body = $('body').text().trim();
          body.should.equal('Voix ambiguë d\'un cœur qui, au ' +
                            'zéphyr, préfère les jattes de kiwis.');
          done();
        });
      },
    }
  }
};
