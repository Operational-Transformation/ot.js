#!/usr/bin/env node

var child_process = require('child_process');

function isPhantomJSInstalled (cb) {
  child_process.exec('which phantomjs', function (err) {
    cb(!err);
  });
}

function runPhantomJSTests () {
  isPhantomJSInstalled(function (isIt) {
    if (!isIt) {
      console.log("Skipping PhantomJS tests because it is not installed.");
      return;
    }

    var express = require('express');
    var path = require('path');
    var app = express.createServer();
    app.configure(function () {
      app.use(express.logger());
      app.use(express.static(path.join(__dirname, 'phantomjs')));
      app.use(express.static(path.join(__dirname, '../dist')));
    });
    app.listen(3000, function (err) {
      if (err) { throw err; }
      var cmd = 'phantomjs test/phantomjs/codemirror-integration.js';
      child_process.exec(cmd, function (err, stdout) {
        app.close(); // stop server
        if (err) {
          throw new Error('PhantomJS test failed:\n' + stdout.toString());
        }
      });
    });
  });
}

function main () {
  runPhantomJSTests();
}

main();