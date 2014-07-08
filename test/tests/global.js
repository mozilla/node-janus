'use strict';

var http = require('http');
var should = require('chai').should();

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

        http.get(req, function(res) {
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

        http.get(req, function(res) {
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
        http.get(req, function(res) {
          res.statusCode.should.equal(200);
          done();
        });
      },

      '404': function(done) {
        var req = helper.makeRequest(helper.getLocalUrl('doesntexist'),
                                     '+gzip');
        http.get(req, function(res) {
          res.statusCode.should.equal(404);
          done();
        });
      },
    },
  }
};
