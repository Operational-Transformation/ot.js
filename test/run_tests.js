#!/usr/bin/env node

var child_process = require('child_process');

var operation_tests = require('./lib/operation');
var client_tests = require('./lib/client');
var server_tests = require('./lib/server');
var client_server_tests = require('./lib/client_server');

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

    var serverProcess = child_process.spawn('bin/server.js');
    setTimeout(function () {
      var cmd = 'phantomjs test/phantomjs/codemirror-integration.js';
      child_process.exec(cmd, function (err, stdout) {
        serverProcess.kill();
        if (err) {
          throw new Error('PhantomJS test failed:\n' + stdout.toString());
        }
      });
    }, 2000);
  });
}

function main () {
  operation_tests.run();
  client_tests.run();
  server_tests.run();
  client_server_tests.run();
  runPhantomJSTests();
}

main();