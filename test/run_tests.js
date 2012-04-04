#!/usr/bin/env node

var operation_tests = require('./operation');
var client_tests = require('./client');
var server_tests = require('./server');
var client_server_tests = require('./client_server');

function main () {
  operation_tests.run();
  client_tests.run();
  server_tests.run();
  client_server_tests.run();
}

main();